import { LEGAL_CORPUS, MIT_REFERENCE } from "./corpus.js";
import { retrieve, buildGroundingContext } from "./ragEngine.js";

const PARTY_NAME = "[A-Z][A-Za-z.&'\\-]+(?:\\s+(?:of|the|and|[A-Z][A-Za-z.&'\\-]+))*";
const CASE_PATTERN = new RegExp(`\\b(${PARTY_NAME}\\s+v\\.?\\s+${PARTY_NAME})\\b`, "g");
const STATUTE_PATTERN = /\b((?:(?:Fed\. R\. (?:Civ\. P\.|Evid\.)|FRCP|FRE|Rule)\s*\d+[a-z]?)|Article\s+\d+[A-Z]?|POCSO(?: Act)?(?:,?\s*2012)?(?:,?\s*s\.?\s*\d+)?)\b/gi;
const YEAR_PATTERN = /\b(18|19|20)\d{2}\b/g;

const BIAS_TERMS = [
  {
    pattern: /\b(all|always|never|naturally|inherently)\s+(women|men|muslims|hindus|christians|immigrants|disabled people|poor people|tribal people|dalits)\b/i,
    label: "Sweeping protected-class generalization"
  },
  {
    pattern: /\b(women are less credible|men are more rational|foreigners are unreliable|poor people lie)\b/i,
    label: "Credibility claim tied to identity"
  },
  {
    pattern: /\b(because\s+(she|he|they)\s+is\s+(female|male|muslim|hindu|disabled|foreign|poor))\b/i,
    label: "Legal inference based on demographic identity"
  }
];

function normalizeCitation(value) {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function allKnownAliases(doc) {
  return [doc.title, doc.citation, ...doc.aliases].map(normalizeCitation);
}

function unique(values) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

export function extractCitations(text) {
  const cases = unique([...String(text).matchAll(CASE_PATTERN)].map((match) => match[1]));
  const statutes = unique([...String(text).matchAll(STATUTE_PATTERN)].map((match) => match[1]));
  return [...cases, ...statutes];
}

export function verifyCitations(text, retrievedDocs) {
  const citations = extractCitations(text);
  const corpusMatches = [...LEGAL_CORPUS, ...retrievedDocs];
  const checked = citations.map((citation) => {
    const normalized = normalizeCitation(citation);
    const match = corpusMatches.find((doc) =>
      allKnownAliases(doc).some((alias) => alias.includes(normalized) || normalized.includes(alias))
    );
    return {
      citation,
      status: match ? "verified" : "unverified",
      matchedSource: match || null
    };
  });

  const unverified = checked.filter((item) => item.status === "unverified");
  const score = citations.length === 0 ? 78 : Math.round(((checked.length - unverified.length) / checked.length) * 100);

  return {
    score,
    citations,
    checked,
    unverified,
    summary:
      citations.length === 0
        ? "No formal citation was detected; answer should cite retrieved sources before use."
        : `${checked.length - unverified.length} of ${checked.length} detected citations matched the verified corpus.`
  };
}

function detectUnsupportedYears(text, retrievedDocs) {
  const years = unique([...String(text).matchAll(YEAR_PATTERN)].map((match) => match[0]));
  return years.filter((year) => !retrievedDocs.some((doc) => `${doc.title} ${doc.citation} ${doc.text}`.includes(year)));
}

function detectRiskPhrases(text) {
  const phrases = [
    { pattern: /\bguarantees?\b/i, label: "Uses absolute legal guarantee language" },
    { pattern: /\bautomatically wins?\b/i, label: "Claims automatic litigation outcome" },
    { pattern: /\bno duty to verify\b/i, label: "Contradicts attorney verification duties" },
    { pattern: /\bchatgpt citations? (?:are|is) sufficient\b/i, label: "Treats generated citations as sufficient authority" },
    { pattern: /\bclearly held\b/i, label: "Strong holding language requires exact support" }
  ];

  return phrases.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

export function detectHallucinations(text, retrievedDocs) {
  const unsupportedYears = detectUnsupportedYears(text, retrievedDocs);
  const riskyPhrases = detectRiskPhrases(text);
  const retrievedText = buildGroundingContext(retrievedDocs).toLowerCase();
  const tokens = String(text)
    .toLowerCase()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 30);

  const unsupportedClaims = tokens
    .filter((sentence) => {
      const legalCue = /\b(held|ruled|statute|article|court|judge|sanction|liable|constitutional|evidence|procedure)\b/.test(sentence);
      if (!legalCue) return false;
      const importantWords = sentence.match(/[a-z]{5,}/g) || [];
      const overlap = importantWords.filter((word) => retrievedText.includes(word)).length;
      return overlap < Math.min(3, importantWords.length);
    })
    .slice(0, 4);

  const issueCount = unsupportedYears.length + riskyPhrases.length + unsupportedClaims.length;
  const score = Math.max(22, 100 - issueCount * 18);

  return {
    score,
    unsupportedYears,
    riskyPhrases,
    unsupportedClaims,
    summary:
      issueCount === 0
        ? "No obvious fabricated dates, invented holdings, or unsupported legal claims were detected."
        : `${issueCount} hallucination risk signal${issueCount === 1 ? "" : "s"} require review.`
  };
}

export function flagBias(text) {
  const flags = BIAS_TERMS.filter((item) => item.pattern.test(text)).map((item) => item.label);
  const loadedWords = unique(String(text).match(/\b(illegal alien|primitive|hysterical|aggressive female|terrorist-looking)\b/gi) || []);
  const issueCount = flags.length + loadedWords.length;
  const score = Math.max(30, 100 - issueCount * 24);

  return {
    score,
    flags,
    loadedWords,
    summary:
      issueCount === 0
        ? "No protected-class stereotyping or identity-based credibility language was detected."
        : `${issueCount} potential bias signal${issueCount === 1 ? "" : "s"} detected.`
  };
}

export function aggregateTrust(citationResult, hallucinationResult, biasResult, retrievedDocs) {
  const retrievalConfidence = retrievedDocs.length
    ? Math.round((retrievedDocs.reduce((sum, doc) => sum + doc.score, 0) / retrievedDocs.length) * 100)
    : 0;
  const weighted = Math.round(
    citationResult.score * 0.34 +
      hallucinationResult.score * 0.34 +
      biasResult.score * 0.2 +
      retrievalConfidence * 0.12
  );
  const score = Math.max(0, Math.min(100, weighted));

  let label = "Verified";
  let level = "green";
  if (score < 55 || citationResult.unverified.length > 1 || hallucinationResult.unsupportedClaims.length > 2) {
    label = "High Risk";
    level = "red";
  } else if (score < 82 || citationResult.unverified.length || hallucinationResult.riskyPhrases.length || biasResult.flags.length) {
    label = "Needs Review";
    level = "yellow";
  }

  return { score, label, level, retrievalConfidence };
}

function sourceLine(doc, index) {
  return `<a href="${doc.sourceUrl}" target="_blank" rel="noreferrer">[S${index + 1}] ${doc.title}</a> <span>${doc.citation}</span>`;
}

export function generateResponse(query, retrievedDocs, citationResult, hallucinationResult, biasResult, trust) {
  if (!retrievedDocs.length) {
    return `
      <p><strong>No grounded legal answer was generated.</strong> The verified corpus did not retrieve enough supporting material for this input.</p>
      <p>Add jurisdiction-specific statutes, case PDFs, or court orders to the corpus before relying on any answer.</p>
    `;
  }

  const sourceLinks = retrievedDocs.map(sourceLine).join("");
  const warnings = [
    ...citationResult.unverified.map((item) => `Unverified citation: ${item.citation}`),
    ...hallucinationResult.unsupportedYears.map((year) => `Unsupported date: ${year}`),
    ...hallucinationResult.riskyPhrases,
    ...biasResult.flags
  ];

  const topDoc = retrievedDocs[0];
  const secondDoc = retrievedDocs[1];
  const warningHtml = warnings.length
    ? `<ul class="warning-list">${warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>`
    : `<p class="clean-note">No high-risk warning was found in the checked text. Human legal review is still required before filing.</p>`;

  return `
    <p><strong>Confidence:</strong> ${trust.score}/100, ${trust.label}. The answer below is limited to retrieved corpus material and should not be treated as legal advice.</p>
    <p>${topDoc.text} ${secondDoc ? secondDoc.text : ""}</p>
    <p><strong>Grounded conclusion:</strong> Based on the verified sources, the safest response is to cite only authorities that appear in the corpus and to mark any unmatched case, statute, or factual assertion for manual verification before use.</p>
    <div class="inline-sources">${sourceLinks}</div>
    <h3>Warnings and notes</h3>
    ${warningHtml}
    <p class="mit-note">Design basis: ${MIT_REFERENCE.publisher} recommends critical review, source diversification, and retrieval-based tools to reduce hallucination and bias risk.</p>
  `;
}

export function analyzeLegalInput(text) {
  const retrievedDocs = retrieve(text);
  const citationResult = verifyCitations(text, retrievedDocs);
  const hallucinationResult = detectHallucinations(text, retrievedDocs);
  const biasResult = flagBias(text);
  const trust = aggregateTrust(citationResult, hallucinationResult, biasResult, retrievedDocs);
  const answer = generateResponse(text, retrievedDocs, citationResult, hallucinationResult, biasResult, trust);

  return {
    retrievedDocs,
    citationResult,
    hallucinationResult,
    biasResult,
    trust,
    answer
  };
}
