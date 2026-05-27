import math
import re
from collections import Counter
from datetime import datetime, timezone

from .corpus import LEGAL_CORPUS

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "with",
    "under",
    "what",
    "when",
    "where",
    "why",
    "how",
}

SEMANTIC_HINTS = {
    "hallucination": ["fabricated", "nonexistent", "invented", "unsupported"],
    "sanction": ["penalty", "lawyer", "attorney", "duty", "filing"],
    "liberty": ["life", "personal", "procedure", "article", "fair"],
    "equality": ["equal", "protection", "discrimination", "classification"],
    "notice": ["judicial", "fact", "dispute", "source", "accuracy"],
    "citation": ["case", "statute", "rule", "authority", "precedent"],
    "illegal": ["offence", "crime", "statute", "liability", "prohibited"],
    "legal": ["lawful", "valid", "permitted", "authority", "procedure"],
}

PARTY = r"[A-Z][A-Za-z.&'\-]+(?:\s+(?:of|the|and|[A-Z][A-Za-z.&'\-]+))*"
CASE_PATTERN = re.compile(rf"\b({PARTY}\s+v\.?\s+{PARTY})\b")
STATUTE_PATTERN = re.compile(
    r"\b((?:(?:Fed\. R\. (?:Civ\. P\.|Evid\.)|FRCP|FRE|Rule)\s*\d+[a-z]?)|"
    r"Article\s+\d+[A-Z]?|POCSO(?: Act)?(?:,?\s*2012)?(?:,?\s*s\.?\s*\d+)?)\b",
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r"\b(?:18|19|20)\d{2}\b")

BIAS_PATTERNS = [
    (re.compile(r"\b(all|always|never|naturally|inherently)\s+(women|men|muslims|hindus|christians|immigrants|disabled people|poor people|tribal people|dalits)\b", re.I), "Sweeping protected-class generalization"),
    (re.compile(r"\b(women are less credible|men are more rational|foreigners are unreliable|poor people lie)\b", re.I), "Credibility claim tied to identity"),
    (re.compile(r"\bbecause\s+(she|he|they)\s+is\s+(female|male|muslim|hindu|disabled|foreign|poor)\b", re.I), "Legal inference based on demographic identity"),
]


def tokenize(text: str) -> list[str]:
    words = re.sub(r"[^a-z0-9.() ]+", " ", text.lower()).split()
    return [word for word in words if len(word) > 2 and word not in STOPWORDS]


def vectorize(text: str) -> Counter:
    tokens = []
    for token in tokenize(text):
        tokens.append(token)
        tokens.extend(SEMANTIC_HINTS.get(token, []))
    return Counter(tokens)


def cosine(left: Counter, right: Counter) -> float:
    dot = sum(value * right.get(token, 0) for token, value in left.items())
    left_mag = math.sqrt(sum(value * value for value in left.values()))
    right_mag = math.sqrt(sum(value * value for value in right.values()))
    if not left_mag or not right_mag:
        return 0.0
    return dot / (left_mag * right_mag)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace(".", "").replace(",", "")).strip()


def retrieve(query: str, top_k: int = 5) -> list[dict]:
    query_vector = vectorize(query)
    scored = []
    lowered = query.lower()

    for doc in LEGAL_CORPUS:
        searchable = " ".join([doc["title"], doc["citation"], *doc["aliases"], doc["text"]])
        score = cosine(query_vector, vectorize(searchable))
        aliases = [doc["title"], doc["citation"], *doc["aliases"]]
        alias_matched = any(alias.lower() in lowered for alias in aliases)
        if alias_matched:
            score += 0.34
        if score > 0.18 or alias_matched:
            scored.append({**doc, "score": round(min(score, 1.0), 3), "excerpt": doc["text"]})

    return sorted(scored, key=lambda item: item["score"], reverse=True)[:top_k]


def extract_citations(text: str) -> list[str]:
    found = [re.sub(r"^(In|See|Cf|Compare)\s+", "", match.group(1).strip()) for match in CASE_PATTERN.finditer(text)]
    found.extend(match.group(1).strip() for match in STATUTE_PATTERN.finditer(text))
    return list(dict.fromkeys(found))


def verify_citations(text: str, retrieved: list[dict]) -> dict:
    citations = extract_citations(text)
    checked = []
    source_pool = [*LEGAL_CORPUS, *retrieved]

    for citation in citations:
        target = normalize(citation)
        match = None
        for doc in source_pool:
            aliases = [doc["title"], doc["citation"], *doc["aliases"]]
            if any(target in normalize(alias) or normalize(alias) in target for alias in aliases):
                match = doc
                break
        checked.append(
            {
                "citation": citation,
                "status": "verified" if match else "unverified",
                "source_id": match["id"] if match else None,
                "source_title": match["title"] if match else None,
            }
        )

    unverified = [item for item in checked if item["status"] == "unverified"]
    score = 78 if not citations else round(((len(checked) - len(unverified)) / len(checked)) * 100)
    return {
        "score": score,
        "citations": citations,
        "checked": checked,
        "unverified": unverified,
        "summary": "No formal citation found." if not citations else f"{len(checked) - len(unverified)} of {len(checked)} citations verified.",
    }


def detect_hallucinations(text: str, retrieved: list[dict]) -> dict:
    retrieved_text = " ".join(doc["text"] + " " + doc["citation"] for doc in retrieved).lower()
    years = list(dict.fromkeys(YEAR_PATTERN.findall(text)))
    unsupported_years = [year for year in years if year not in retrieved_text]
    risky_patterns = [
        (re.compile(r"\bguarantees?\b", re.I), "Uses absolute guarantee language"),
        (re.compile(r"\bautomatically wins?\b", re.I), "Claims automatic legal outcome"),
        (re.compile(r"\bno duty to verify\b", re.I), "Contradicts verification duties"),
        (re.compile(r"\bai-generated citations? (?:are|is) sufficient\b", re.I), "Treats generated citations as sufficient"),
        (re.compile(r"\bchatgpt citations? (?:are|is) sufficient\b", re.I), "Treats generated citations as sufficient"),
    ]
    risky_phrases = [label for pattern, label in risky_patterns if pattern.search(text)]
    unsupported_claims = []

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if len(sentence) < 32:
            continue
        legal_cue = re.search(r"\b(held|ruled|statute|article|court|judge|sanction|liable|illegal|lawful|constitutional|evidence|procedure)\b", sentence, re.I)
        if not legal_cue:
            continue
        important = re.findall(r"[a-z]{5,}", sentence.lower())
        overlap = sum(1 for word in important if word in retrieved_text)
        if overlap < min(3, len(important)):
            unsupported_claims.append(sentence[:220])

    issue_count = len(unsupported_years) + len(risky_phrases) + len(unsupported_claims[:4])
    return {
        "score": max(18, 100 - issue_count * 18),
        "unsupported_years": unsupported_years,
        "risky_phrases": risky_phrases,
        "unsupported_claims": unsupported_claims[:4],
        "summary": "No obvious fabricated legal claim detected." if issue_count == 0 else f"{issue_count} hallucination risk signal(s) found.",
    }


def flag_bias(text: str) -> dict:
    flags = [label for pattern, label in BIAS_PATTERNS if pattern.search(text)]
    loaded_words = re.findall(r"\b(illegal alien|primitive|hysterical|aggressive female|terrorist-looking)\b", text, re.I)
    issue_count = len(flags) + len(loaded_words)
    return {
        "score": max(30, 100 - issue_count * 24),
        "flags": flags,
        "loaded_words": list(dict.fromkeys(loaded_words)),
        "summary": "No identity-based bias signal found." if issue_count == 0 else f"{issue_count} bias signal(s) found.",
    }


def legal_scope(text: str, retrieved: list[dict]) -> dict:
    cues = re.findall(
        r"\b(court|case|statute|law|legal|illegal|crime|offence|contract|petition|filing|judge|evidence|article|rule|section|rights?|liability|sanction)\b",
        text,
        re.I,
    )
    in_scope = bool(cues or retrieved)
    return {
        "in_scope": in_scope,
        "summary": "Legal issue detected." if in_scope else "Input does not appear to ask a legal or illegal issue.",
    }


def aggregate(citations: dict, hallucinations: dict, bias: dict, retrieved: list[dict], scope: dict) -> dict:
    retrieval_confidence = round(sum(doc["score"] for doc in retrieved) / len(retrieved) * 100) if retrieved else 0
    score = round(
        citations["score"] * 0.32
        + hallucinations["score"] * 0.34
        + bias["score"] * 0.18
        + retrieval_confidence * 0.16
    )
    if not scope["in_scope"]:
        score = min(score, 35)

    label = "Verified"
    level = "green"
    if score < 55 or len(citations["unverified"]) > 1 or not scope["in_scope"]:
        label = "High Risk"
        level = "red"
    elif score < 82 or citations["unverified"] or hallucinations["risky_phrases"] or bias["flags"]:
        label = "Needs Review"
        level = "yellow"

    return {
        "score": max(0, min(100, score)),
        "label": label,
        "level": level,
        "retrieval_confidence": retrieval_confidence,
    }


def build_response(query: str, retrieved: list[dict], citations: dict, hallucinations: dict, bias: dict, scope: dict, trust: dict, files: list[dict]) -> str:
    if not scope["in_scope"]:
        return (
            "I can verify only legal or illegal issues. This message does not contain enough "
            "legal context, so I am not generating a legal answer. Please add the relevant "
            "law, fact pattern, citation, filing excerpt, or question."
        )

    if not retrieved:
        return (
            "I could not retrieve a verified source for this issue from the local legal corpus. "
            "The safe result is High Risk until a statute, case, order, or rule is added to the corpus."
        )

    warnings = []
    warnings.extend(f"Unverified citation: {item['citation']}" for item in citations["unverified"])
    warnings.extend(f"Unsupported year: {year}" for year in hallucinations["unsupported_years"])
    warnings.extend(hallucinations["risky_phrases"])
    warnings.extend(bias["flags"])

    source_lines = " ".join(
        f"[S{index + 1}] {doc['title']} ({doc['citation']})." for index, doc in enumerate(retrieved[:3])
    )
    file_note = ""
    if files:
        names = ", ".join(file["name"] for file in files[:4])
        file_note = f" Attached material received: {names}."

    warning_text = " No major warning was found." if not warnings else " Warnings: " + "; ".join(warnings[:6]) + "."
    return (
        f"Trust result: {trust['label']} with score {trust['score']}/100. "
        f"Verified legal response: based only on retrieved sources, the strongest grounded answer is: "
        f"{retrieved[0]['text']} "
        f"Any legal conclusion should stay limited to these verified materials unless more sources are added. "
        f"{source_lines}{warning_text}{file_note}"
    )


def analyze_legal_issue(message: str, files: list[dict] | None = None) -> dict:
    files = files or []
    file_context = " ".join(file.get("text", "") for file in files if file.get("text"))
    combined_text = f"{message}\n{file_context}".strip()
    retrieved = retrieve(combined_text)
    citations = verify_citations(combined_text, retrieved)
    hallucinations = detect_hallucinations(combined_text, retrieved)
    bias = flag_bias(combined_text)
    scope = legal_scope(combined_text, retrieved)
    trust = aggregate(citations, hallucinations, bias, retrieved, scope)
    response = build_response(combined_text, retrieved, citations, hallucinations, bias, scope, trust, files)

    return {
        "id": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope": scope,
        "trust": trust,
        "response": response,
        "modules": {
            "citation_verifier": citations,
            "hallucination_detector": hallucinations,
            "bias_flagger": bias,
        },
        "sources": retrieved,
        "files": files,
    }
