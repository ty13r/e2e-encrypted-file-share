import base64
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlmodel import Session

from .db import init_db, get_session
from .models import Share
from . import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("files")


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
)


class UploadRequest(BaseModel):
    iv_b64: str = Field(..., description="base64-encoded 12-byte AES-GCM IV")
    ciphertext_b64: str = Field(..., description="base64-encoded ciphertext (header+body, AES-GCM)")


class UploadResponse(BaseModel):
    id: str


class FileResponse(BaseModel):
    id: str
    iv_b64: str
    ciphertext_b64: str
    size: int
    created_at: datetime


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/files", response_model=UploadResponse)
def upload_file(req: UploadRequest, session: Session = Depends(get_session)):
    try:
        ciphertext = base64.b64decode(req.ciphertext_b64)
        iv = base64.b64decode(req.iv_b64)
    except Exception:
        raise HTTPException(400, "invalid base64")
    if len(iv) != 12:
        raise HTTPException(400, "iv must be 12 bytes")
    if not ciphertext:
        raise HTTPException(400, "ciphertext required")

    file_id = storage.new_id()
    storage.write_blob(file_id, ciphertext)
    share = Share(id=file_id, iv_b64=req.iv_b64, size=len(ciphertext))
    session.add(share)
    session.commit()

    log.info(
        "upload id=%s size=%d sample=%s",
        file_id,
        len(ciphertext),
        ciphertext[:16].hex(),
    )
    return UploadResponse(id=file_id)


@app.get("/files/{file_id}", response_model=FileResponse)
def get_file(file_id: str, session: Session = Depends(get_session)):
    share = session.get(Share, file_id)
    if not share:
        raise HTTPException(404, "not found")
    try:
        ciphertext = storage.read_blob(file_id)
    except FileNotFoundError:
        raise HTTPException(410, "blob missing")

    log.info("download id=%s size=%d", file_id, len(ciphertext))
    return FileResponse(
        id=share.id,
        iv_b64=share.iv_b64,
        ciphertext_b64=base64.b64encode(ciphertext).decode(),
        size=share.size,
        created_at=share.created_at,
    )
