# One image, two services. `ocr` is product; `docgen` is a test fixture.
# Which one runs is decided by SERVICE_MODE, so a fixture generator cannot be
# reached from the product service by accident.
FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "Pillow==12.2.0"

WORKDIR /app
COPY render.py app.py ./

ENV SERVICE_MODE=ocr
ENV PORT=8090
EXPOSE 8090 8092

CMD ["python", "app.py"]
