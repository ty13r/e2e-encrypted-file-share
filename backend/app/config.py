from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATABASE_URL = f"sqlite:///{BASE_DIR}/app.db"

DATA_DIR.mkdir(exist_ok=True)
