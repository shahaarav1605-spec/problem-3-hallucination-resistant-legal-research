# LexGuard: Hallucination-Resistant Legal Research Assistant

LexGuard is a hackathon prototype for checking AI-generated legal text against a verified legal corpus before producing an answer. It demonstrates a RAG-first workflow, citation verification, hallucination risk detection, bias flagging, and a single trust score.

## Why this matters

MIT Sloan Teaching & Learning Technologies warns that generative AI can fabricate information and amplify harmful bias. Their guidance recommends critical review, diversified sources, retrieval-based tools, structured prompts, and low-temperature factual generation. LexGuard turns that guidance into a legal research workflow where generation is blocked unless the system first retrieves source material.

Reference: https://mitsloanedtech.mit.edu/ai/basics/addressing-ai-hallucinations-and-bias/

## Features

- RAG-style retrieval over a local verified legal corpus
- Mandatory citations in the generated answer
- Citation verifier for cases, rules, statutes, and constitutional provisions
- Hallucination detector for unsupported dates, invented holdings, and risky absolute claims
- Bias flagger for protected-class stereotypes and identity-based credibility language
- Trust score aggregator with High Risk, Needs Review, and Verified states
- No paid API key required for the demo

## Run locally

```bash
npm start
```

Open http://localhost:4173.

## Test

```bash
npm test
```

## Project structure

```text
index.html          Main app shell
server.mjs          Tiny no-dependency static server
src/corpus.js       Verified legal knowledge base
src/ragEngine.js    Local vector-style retrieval
src/analyzers.js    Citation, hallucination, bias, and trust modules
src/app.js          UI orchestration
src/styles.css      Responsive product UI
test/               Node test suite
```

## Production path

For a real deployment, replace the demo corpus with jurisdiction-specific court orders, statutes, and precedents from licensed or official sources. Store document chunks in a vector database, preserve source metadata at chunk level, and require the response generator to cite only retrieved chunks.
