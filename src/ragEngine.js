import { LEGAL_CORPUS } from "./corpus.js";

const STOPWORDS = new Set([
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
  "how"
]);

const SEMANTIC_HINTS = {
  hallucination: ["fabricated", "nonexistent", "unsupported", "invented", "false"],
  sanction: ["penalty", "discipline", "rule", "attorney", "duty"],
  liberty: ["life", "personal", "procedure", "article", "fair"],
  equality: ["equal", "protection", "discrimination", "classification"],
  notice: ["judicial", "fact", "dispute", "source", "accuracy"],
  citation: ["case", "statute", "rule", "authority", "precedent"]
};

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9.() ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function expandTokens(tokens) {
  const expanded = [...tokens];
  tokens.forEach((token) => {
    if (SEMANTIC_HINTS[token]) {
      expanded.push(...SEMANTIC_HINTS[token]);
    }
  });
  return expanded;
}

function vectorize(text) {
  const vector = new Map();
  expandTokens(tokenize(text)).forEach((token) => {
    vector.set(token, (vector.get(token) || 0) + 1);
  });
  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  a.forEach((value, token) => {
    aMagnitude += value * value;
    dot += value * (b.get(token) || 0);
  });
  b.forEach((value) => {
    bMagnitude += value * value;
  });

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function aliasBoost(query, doc) {
  const lowered = query.toLowerCase();
  const aliases = [doc.title, doc.citation, ...doc.aliases].map((item) => item.toLowerCase());
  return aliases.some((alias) => lowered.includes(alias)) ? 0.32 : 0;
}

export function retrieve(query, topK = 4) {
  const queryVector = vectorize(query);
  return LEGAL_CORPUS.map((doc) => {
    const searchable = `${doc.title} ${doc.citation} ${doc.aliases.join(" ")} ${doc.text}`;
    const score = cosineSimilarity(queryVector, vectorize(searchable)) + aliasBoost(query, doc);
    return {
      ...doc,
      score: Number(Math.min(score, 1).toFixed(3)),
      excerpt: doc.text
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((doc) => doc.score > 0.02);
}

export function buildGroundingContext(retrievedDocs) {
  return retrievedDocs
    .map((doc, index) => `[S${index + 1}] ${doc.title}; ${doc.citation}. ${doc.text}`)
    .join("\n");
}
