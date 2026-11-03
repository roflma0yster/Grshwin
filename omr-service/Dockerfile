# Audiveris OMR service. UNTESTED: verify the Audiveris install and CLI name
# against https://github.com/Audiveris/audiveris before deploying.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv curl ca-certificates \
      tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Audiveris 5.7.0 installer for Ubuntu 24.04, downloaded at build time and verified
# against its SHA-256 (both from the GitHub release page). If you change versions,
# update both values.
ARG AUDIVERIS_DEB_URL=https://github.com/Audiveris/audiveris/releases/download/5.7.0/Audiveris-5.7.0-ubuntu24.04-x86_64.deb
ARG AUDIVERIS_DEB_SHA256=b7d26b9a90136af8ffaaba789f842c7e1593180fc0200faa82256c5c51eae426
RUN curl -fsSL "$AUDIVERIS_DEB_URL" -o /tmp/audiveris.deb \
    && echo "${AUDIVERIS_DEB_SHA256}  /tmp/audiveris.deb" | sha256sum -c - \
    && apt-get update && apt-get install -y --no-install-recommends /tmp/audiveris.deb \
    && rm -rf /tmp/audiveris.deb /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /venv && /venv/bin/pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Set AUDIVERIS_CMD if the installed launcher is not on PATH as "audiveris".
ENV PATH="/venv/bin:$PATH" PORT=8080
RUN useradd -m omr
USER omr
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
