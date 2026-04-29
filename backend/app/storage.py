import base64
import secrets
from pathlib import Path
from .config import DATA_DIR


def new_id() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b"=").decode()


def blob_path(file_id: str) -> Path:
    return DATA_DIR / f"{file_id}.bin"


def write_blob(file_id: str, ciphertext: bytes) -> None:
    blob_path(file_id).write_bytes(ciphertext)


def read_blob(file_id: str) -> bytes:
    return blob_path(file_id).read_bytes()
