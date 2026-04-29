import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from .db import init_db, get_session
from .models import Share
from . import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("files")

EXPOSE_HEADERS = ["X-IV-B64", "X-File-Size", "X-Created-At"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=EXPOSE_HEADERS,
)


class UploadResponse(BaseModel):
    id: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/files", response_model=UploadResponse)
async def upload_file(
    ciphertext: UploadFile = File(..., description="raw ciphertext bytes"),
    iv_b64: str = Form(..., description="base64-encoded 12-byte AES-GCM IV"),
    session: Session = Depends(get_session),
):
    body = await ciphertext.read()
    if not body:
        raise HTTPException(400, "ciphertext required")

    try:
        import base64
        iv = base64.b64decode(iv_b64)
    except Exception:
        raise HTTPException(400, "iv_b64 must be base64")
    if len(iv) != 12:
        raise HTTPException(400, "iv must decode to 12 bytes")

    file_id = storage.new_id()
    storage.write_blob(file_id, body)
    share = Share(id=file_id, iv_b64=iv_b64, size=len(body))
    session.add(share)
    session.commit()

    log.info("upload id=%s size=%d sample=%s", file_id, len(body), body[:16].hex())
    return UploadResponse(id=file_id)


@app.get("/files/{file_id}")
def get_file(file_id: str, session: Session = Depends(get_session)):
    share = session.get(Share, file_id)
    if not share:
        raise HTTPException(404, "not found")
    try:
        ciphertext = storage.read_blob(file_id)
    except FileNotFoundError:
        raise HTTPException(410, "blob missing")

    log.info("download id=%s size=%d", file_id, len(ciphertext))
    return Response(
        content=ciphertext,
        media_type="application/octet-stream",
        headers={
            "X-IV-B64": share.iv_b64,
            "X-File-Size": str(share.size),
            "X-Created-At": share.created_at.isoformat(),
        },
    )
