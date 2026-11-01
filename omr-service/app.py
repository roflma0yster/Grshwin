"""Tiny HTTP wrapper around the Audiveris CLI: POST a PDF, get MusicXML back."""
import asyncio
import hmac
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

TOKEN = os.environ.get("OMR_SERVICE_TOKEN", "")
AUDIVERIS_CMD = os.environ.get("AUDIVERIS_CMD", "audiveris")
MAX_BYTES = int(os.environ.get("MAX_PDF_BYTES", str(15 * 1024 * 1024)))
TIMEOUT_S = int(os.environ.get("OMR_TIMEOUT_SECONDS", "240"))

app = FastAPI()
# OMR is memory-hungry: process one job at a time per instance.
gate = asyncio.Semaphore(1)


def read_musicxml(out_dir: Path) -> bytes:
    """Return uncompressed MusicXML from Audiveris output (.mxl or .xml)."""
    for mxl in sorted(out_dir.rglob("*.mxl")):
        with zipfile.ZipFile(mxl) as z:
            root_file = None
            if "META-INF/container.xml" in z.namelist():
                tree = ElementTree.fromstring(z.read("META-INF/container.xml"))
                for el in tree.iter():
                    if el.tag.endswith("rootfile"):
                        root_file = el.attrib.get("full-path")
                        break
            if not root_file:
                root_file = next(n for n in z.namelist() if n.endswith(".xml") and not n.startswith("META-INF"))
            return z.read(root_file)
    for xml in sorted(out_dir.rglob("*.xml")):
        return xml.read_bytes()
    raise FileNotFoundError("Audiveris produced no MusicXML")


def run_audiveris(pdf: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.pdf"
        out = Path(tmp) / "out"
        out.mkdir()
        src.write_bytes(pdf)
        subprocess.run(
            [AUDIVERIS_CMD, "-batch", "-export", "-output", str(out), str(src)],
            check=True, timeout=TIMEOUT_S, capture_output=True,
        )
        return read_musicxml(out)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/omr")
async def omr(request: Request):
    auth = request.headers.get("authorization", "")
    if not TOKEN or not hmac.compare_digest(auth, f"Bearer {TOKEN}"):
        raise HTTPException(401, "Unauthorized")
    pdf = await request.body()
    if len(pdf) > MAX_BYTES:
        raise HTTPException(413, "PDF too large")
    if not pdf.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    async with gate:
        try:
            xml = await asyncio.to_thread(run_audiveris, pdf)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Recognition timed out")
        except Exception:
            # Never echo engine output back: it may include file contents.
            raise HTTPException(422, "Could not recognise this score")
    return Response(content=xml, media_type="application/xml")
