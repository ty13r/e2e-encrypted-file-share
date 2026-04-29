from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Share(SQLModel, table=True):
    id: str = Field(primary_key=True)
    iv_b64: str
    size: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
