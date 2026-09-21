"""
Renders a synthetic Fijian-style identity card.

FIXTURE ONLY. Nothing here belongs in a real deployment. Every card it produces
carries the words SPECIMEN - NOT A REAL DOCUMENT, and every person on one is
invented.

Four qualities exist, and each one is tuned to land in a different band of the
identity decision rules, so that every branch of those rules is reachable by
construction rather than by hope. Measured on 2026-09-22 with
`tesseract - stdout tsv`:

    clean      mean word confidence 0.93, all four fields read
    photo      mean word confidence 0.94, all four fields read
    smudged    mean word confidence about 0.55, document number lost or misread
    illegible  no words detected at all, confidence 0.00

The gap between `smudged` and `illegible` is deliberately wide. They are
separated only by confidence - both lose every field - so a narrow margin would
make the declined path flip to referred on any Tesseract change.

Rendering is deterministic: the same inputs give byte-identical output, because
the noise generator is seeded from the document number.
"""

import io
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1000, 620

QUALITIES = ("clean", "photo", "smudged", "illegible")

# Blend towards grey, blur radius, noise pixel count. Tuned against Tesseract,
# not guessed; see the module docstring for the measured result of each.
_DEGRADE = {
    "smudged": (0.58, 2.4, 50000),
    "illegible": (0.80, 5.0, 140000),
}

_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def _font(size):
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _base_card(surname, given_names, date_of_birth, document_number):
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)

    draw.rectangle([0, 0, WIDTH - 1, HEIGHT - 1], outline="black", width=3)
    draw.rectangle([0, 0, WIDTH - 1, 90], fill="#123a5a")
    draw.text((30, 28), "REPUBLIC OF FIJI  -  NATIONAL IDENTITY CARD", font=_font(30), fill="white")

    # Not decoration. A reader who finds one of these must be able to tell at a
    # glance that it is not a real document.
    draw.text((30, 110), "SPECIMEN - NOT A REAL DOCUMENT", font=_font(22), fill="#a3121a")

    rows = (
        ("SURNAME", surname),
        ("GIVEN NAMES", given_names),
        ("DATE OF BIRTH", date_of_birth),
        ("DOCUMENT NUMBER", document_number),
    )
    y = 165
    for label, value in rows:
        draw.text((30, y), label, font=_font(20), fill="#444444")
        draw.text((330, y - 4), value, font=_font(30), fill="black")
        y += 60

    draw.text((30, HEIGHT - 60), "VITIWAI UTILITIES DEMONSTRATION DATA", font=_font(18), fill="#666666")
    return image


def _degrade(image, quality, seed_text):
    blend, blur, noise_count = _DEGRADE[quality]
    image = Image.blend(image, Image.new("RGB", image.size, "#9a9a9a"), blend)
    image = image.filter(ImageFilter.GaussianBlur(blur))

    # Seeded from the document number, so the same request gives the same bytes.
    rng = random.Random(seed_text)
    pixels = image.load()
    width, height = image.size
    for _ in range(noise_count):
        x = rng.randrange(width)
        y = rng.randrange(height)
        delta = rng.randrange(-38, 38)
        r, g, b = pixels[x, y]
        pixels[x, y] = (
            max(0, min(255, r + delta)),
            max(0, min(255, g + delta)),
            max(0, min(255, b + delta)),
        )
    return image


def render_card(surname, given_names, date_of_birth, document_number, quality="clean"):
    """Returns PNG bytes. Deterministic for a given set of inputs."""
    if quality not in QUALITIES:
        raise ValueError(f"quality must be one of {', '.join(QUALITIES)}")

    image = _base_card(surname, given_names, date_of_birth, document_number)

    if quality == "photo":
        # A grey border and a slight rotation, so it resembles a photograph of a
        # card rather than a scan of one.
        framed = Image.new("RGB", (WIDTH + 80, HEIGHT + 80), "#d8d8d8")
        framed.paste(image, (40, 40))
        image = framed.rotate(-1.2, resample=Image.BICUBIC, fillcolor="#d8d8d8")
    elif quality in _DEGRADE:
        image = _degrade(image, quality, document_number)

    buffer = io.BytesIO()
    # optimize=True keeps the bytes stable for identical input.
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
