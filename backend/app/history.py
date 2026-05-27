import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
HISTORY_FILE = DATA_DIR / "history.json"


def read_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def append_history(item: dict) -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    history = read_history()
    history.append(item)
    HISTORY_FILE.write_text(json.dumps(history[-100:], indent=2), encoding="utf-8")
    return history[-100:]


def clear_history() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text("[]", encoding="utf-8")
