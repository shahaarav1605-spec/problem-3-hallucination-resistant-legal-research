from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .history import append_history, clear_history, read_history
from .legal_engine import analyze_legal_issue

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT

app = FastAPI(title="LexGuard API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if (FRONTEND_DIR / "src").exists():
    app.mount("/src", StaticFiles(directory=FRONTEND_DIR / "src"), name="src")

if (FRONTEND_DIR / "docs").exists():
    app.mount("/docs", StaticFiles(directory=FRONTEND_DIR / "docs"), name="docs")


async def summarize_upload(upload: UploadFile) -> dict:
    raw = await upload.read()
    text = ""
    if upload.content_type and (
        upload.content_type.startswith("text/")
        or upload.filename.lower().endswith((".txt", ".csv", ".md", ".json", ".rtf"))
    ):
        text = raw.decode("utf-8", errors="ignore")[:6000]

    return {
        "name": upload.filename,
        "content_type": upload.content_type or "application/octet-stream",
        "size": len(raw),
        "text": text,
    }


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/health")
def health():
    return {"ok": True, "mode": "deterministic-rag", "llm": False}


@app.post("/api/analyze")
async def analyze(message: str = Form(default=""), files: list[UploadFile] = File(default=[])):
    uploads = [await summarize_upload(file) for file in files]
    result = analyze_legal_issue(message.strip(), uploads)
    append_history(result)
    return result


@app.get("/api/history")
def history():
    return {"items": read_history()}


@app.delete("/api/history")
def delete_history():
    clear_history()
    return {"items": []}
