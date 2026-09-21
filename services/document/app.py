"""
The document service. One image, two modes.

    SERVICE_MODE=ocr      serves POST /v1/read    - PRODUCT
    SERVICE_MODE=docgen   serves POST /v1/render  - FIXTURE ONLY

They are separate services in `compose.yaml` rather than two endpoints on one,
so a fixture generator cannot be reached through the product service by
accident.

`http.server` rather than a web framework: there are two endpoints, and a
framework would be the largest dependency in the container.
"""

import csv
import io
import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = os.environ.get("SERVICE_MODE", "ocr")
PORT = int(os.environ.get("PORT", "8090"))
MAX_BODY = 8 * 1024 * 1024

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

_MONTHS = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
    "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}


def normalise_date(text):
    """`14 MAR 1991` becomes `1991-03-14`. Anything else returns None."""
    if not text:
        return None
    match = re.search(r"\b(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\b", text.upper())
    if not match:
        return None
    day, month, year = match.groups()
    if month not in _MONTHS:
        return None
    return f"{year}-{_MONTHS[month]}-{int(day):02d}"


def run_tesseract(image_bytes, tsv=False):
    """Passes the image on stdin. No temporary file is written."""
    args = ["tesseract", "-", "stdout"] + (["tsv"] if tsv else [])
    done = subprocess.run(args, input=image_bytes, capture_output=True, timeout=60)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode("utf-8", "replace")[:400])
    return done.stdout.decode("utf-8", "replace")


def parse_tsv(tsv_text):
    """
    Returns (words, mean_confidence).

    The `conf` and `text` columns are found **by name from the header row**, not
    by position. During this increment's review a column index was assumed, the
    text column was averaged as though it were confidence, and a perfectly read
    document appeared to score 64.7 instead of 93.3.
    """
    reader = csv.reader(io.StringIO(tsv_text), delimiter="\t", quoting=csv.QUOTE_NONE)
    try:
        header = next(reader)
    except StopIteration:
        return [], 0.0

    try:
        level_i = header.index("level")
        conf_i = header.index("conf")
        text_i = header.index("text")
    except ValueError as exc:
        raise RuntimeError(f"unexpected tesseract TSV header: {header}") from exc

    words = []
    confidences = []
    for row in reader:
        if len(row) <= max(level_i, conf_i, text_i):
            continue
        if row[level_i] != "5":
            continue
        text = row[text_i].strip()
        if not text:
            continue
        try:
            conf = float(row[conf_i])
        except ValueError:
            continue
        if conf < 0:
            continue
        words.append(text)
        confidences.append(conf)

    mean = sum(confidences) / len(confidences) if confidences else 0.0
    return words, mean


def extract_fields(raw_text):
    """Pulls the four fields out of the label/value layout the cards use."""
    fields = {"surname": None, "givenNames": None, "dateOfBirth": None, "documentNumber": None}
    for line in raw_text.splitlines():
        stripped = line.strip()
        upper = stripped.upper()
        if upper.startswith("SURNAME"):
            fields["surname"] = stripped[len("SURNAME"):].strip() or None
        elif upper.startswith("GIVEN NAMES"):
            fields["givenNames"] = stripped[len("GIVEN NAMES"):].strip() or None
        elif upper.startswith("DATE OF BIRTH"):
            fields["dateOfBirth"] = normalise_date(stripped)
        elif upper.startswith("DOCUMENT NUMBER"):
            value = stripped[len("DOCUMENT NUMBER"):].strip()
            fields["documentNumber"] = value.replace(" ", "") or None
    return fields


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter than the default
        sys.stderr.write(f"[{MODE}] {fmt % args}\n")

    def _send(self, status, payload, content_type="application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return None, "the request body is empty"
        if length > MAX_BODY:
            return None, f"the request body exceeds {MAX_BODY} bytes"
        return self.rfile.read(length), None

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, {"status": "ok", "mode": MODE})
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        if MODE == "ocr" and self.path == "/v1/read":
            return self._read()
        if MODE == "docgen" and self.path == "/v1/render":
            return self._render()
        self._send(404, {"error": "not_found", "message": f"{self.path} is not served in {MODE} mode"})

    def _read(self):
        body, error = self._read_body()
        if error:
            return self._send(400, {"error": "invalid_request", "message": error})
        if not (body.startswith(PNG_MAGIC) or body.startswith(JPEG_MAGIC)):
            return self._send(415, {
                "error": "unsupported_type",
                "message": "the body is not a PNG or JPEG image",
            })
        try:
            raw_text = run_tesseract(body)
            words, mean_conf = parse_tsv(run_tesseract(body, tsv=True))
        except Exception as exc:  # noqa: BLE001 - reported, not swallowed
            return self._send(500, {"error": "ocr_failed", "message": str(exc)[:400]})

        self._send(200, {
            "rawText": raw_text,
            "fields": extract_fields(raw_text),
            "confidence": round(mean_conf / 100.0, 4),
            "wordCount": len(words),
        })

    def _render(self):
        from render import render_card, QUALITIES

        body, error = self._read_body()
        if error:
            return self._send(400, {"error": "invalid_request", "message": error})
        try:
            spec = json.loads(body)
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid_request", "message": "body is not valid JSON"})

        missing = [k for k in ("surname", "givenNames", "dateOfBirth", "documentNumber") if not spec.get(k)]
        if missing:
            return self._send(400, {
                "error": "invalid_request",
                "message": f"missing: {', '.join(missing)}",
            })

        quality = spec.get("quality", "clean")
        if quality not in QUALITIES:
            return self._send(400, {
                "error": "invalid_request",
                "message": f"quality must be one of {', '.join(QUALITIES)}",
            })

        png = render_card(
            spec["surname"], spec["givenNames"], spec["dateOfBirth"],
            spec["documentNumber"], quality,
        )
        self._send(200, png, content_type="image/png")


def main():
    if MODE not in ("ocr", "docgen"):
        sys.exit(f"SERVICE_MODE must be 'ocr' or 'docgen', not {MODE!r}")
    if MODE == "docgen":
        print("[docgen] FIXTURE ONLY - renders synthetic documents. Never deploy this service.",
              flush=True)
    else:
        print(f"[ocr] reading documents on port {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
