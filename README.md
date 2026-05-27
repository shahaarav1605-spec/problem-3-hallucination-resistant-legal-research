# Hallucination-Resistant Legal Research Assistant

![LexGuard app screenshot](docs/app-screenshot.png)

LexGuard is a RAG-powered legal research chatbot for the hackathon problem statement:

> A Stanford HAI study found general-purpose AI chatbots hallucinated on 58-82% of legal research queries; even specialized RAG-based legal tools hallucinated more than 17% of the time. Build a RAG-powered legal chatbot grounded strictly in verified document corpora, such as court orders and statutes, with mandatory source citations and a confidence score per answer.

The project is built as a no-LLM verification assistant. It does not ask a model to invent legal reasoning. Instead, the FastAPI backend retrieves from a verified local corpus, checks the user's text, scores risk, and returns a controlled legal response with citations.

## Judge Highlights

- ChatGPT-style interface focused on one clean chatbox
- Saved chat history with a sidebar conversation list
- File support for images, photos, videos, audio, PDFs, Word files, text files, and evidence documents
- Voice-note recording from the browser
- FastAPI backend connected to the UI
- Deterministic RAG retrieval over a verified legal corpus
- Citation verifier for cases, statutes, rules, and constitutional provisions
- Hallucination detector for invented rulings, unsupported dates, unsafe absolute claims, and contradiction signals
- Bias flagger for demographic, racial, gender, disability, and identity-based risk language
- Trust score per answer: `High Risk`, `Needs Review`, or `Verified`
- Mandatory verified source cards in each legal answer
- Refuses ordinary non-legal chat and only verifies legal or illegal issues
- Vercel-ready structure with `api/index.py`, `requirements.txt`, and `vercel.json`

## Architecture

```text
User input or upload
        |
        v
FastAPI /api/analyze
        |
        v
RAG retrieval from verified corpus
        |
        +--> Citation verifier
        +--> Hallucination detector
        +--> Bias flagger
        |
        v
Trust score aggregator
        |
        v
Verified legal response with citations
```

## Run Locally

Requirements:

- Python 3.12+
- pip

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the app:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000
```

Windows helper:

```powershell
.\scripts\run-local.ps1
```

## Test

```bash
python -m unittest discover tests
```

## API

```text
GET    /health
POST   /api/analyze
GET    /api/history
DELETE /api/history
```

`POST /api/analyze` accepts multipart form data:

```text
message: legal question, legal paragraph, or filing excerpt
files: optional uploaded files
```

## History

The app saves chat history in browser `localStorage`, so conversations remain visible after refresh and can be reopened from the left sidebar. The backend also stores local analysis history in `data/history.json` when running locally.

On Vercel, browser chat history remains persistent for the user. Serverless backend history is treated as temporary because serverless filesystem storage is not permanent.

## Deploy To Vercel

Install and log in:

```bash
npm i -g vercel
vercel login
```

Deploy from this project folder:

```bash
vercel --prod
```

Vercel serves the chat UI and routes `/api/*` requests to the FastAPI backend through `api/index.py`.

## Project Structure

```text
api/index.py             Vercel FastAPI entrypoint
backend/app/main.py      FastAPI app and routes
backend/app/legal_engine.py
                         RAG retrieval, verification modules, scoring, response generation
backend/app/corpus.py    Verified legal corpus
backend/app/history.py   Local/temporary API history storage
index.html               Chat UI shell
src/app.js               Chat behavior, uploads, voice notes, saved conversations
src/styles.css           Responsive polished UI
requirements.txt         Backend dependencies
vercel.json              Vercel routing
tests/                   Backend verification tests
```
