import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLegalInput, extractCitations } from "../src/analyzers.js";

test("extracts case and statute-style citations", () => {
  const citations = extractCitations("Mata v. Avianca cited Rule 11 and Article 21.");
  assert.ok(citations.includes("Mata v. Avianca"));
  assert.ok(citations.includes("Rule 11"));
  assert.ok(citations.includes("Article 21"));
});

test("flags an invented citation as unverified", () => {
  const result = analyzeLegalInput("Varghese v. China Southern Airlines held that ChatGPT citations are sufficient.");
  assert.equal(result.citationResult.unverified.length, 1);
  assert.equal(result.trust.label, "High Risk");
});

test("returns grounded sources for Article 21 query", () => {
  const result = analyzeLegalInput("What does Article 21 say about personal liberty under Maneka Gandhi?");
  const sourceIds = result.retrievedDocs.map((doc) => doc.id);
  assert.ok(sourceIds.includes("india-article-21"));
  assert.ok(sourceIds.includes("maneka-gandhi"));
});

test("flags demographic credibility bias", () => {
  const result = analyzeLegalInput("Because she is female, the witness is naturally emotional and less credible.");
  assert.ok(result.biasResult.flags.length > 0);
  assert.notEqual(result.trust.label, "Verified");
});
