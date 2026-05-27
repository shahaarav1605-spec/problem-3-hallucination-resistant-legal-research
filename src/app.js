import { LEGAL_CORPUS } from "./corpus.js";
import { analyzeLegalInput } from "./analyzers.js";

const examples = {
  avianca:
    "Please verify this AI-generated paragraph: In Mata v. Avianca, the court held that lawyers have no duty to verify ChatGPT citations and that AI-generated citations are sufficient. It also cites Varghese v. China Southern Airlines, 925 F.3d 1339 (2d Cir. 2019).",
  constitutional:
    "What do Article 21 and Maneka Gandhi say about personal liberty and fair procedure in India? Please cite the verified sources.",
  bias:
    "Draft review: Because she is female, the witness is naturally emotional and less credible. The court should discount her statement. Add any legal risks with citations."
};

const input = document.querySelector("#legal-input");
const matterType = document.querySelector("#matter-type");
const analyzeButton = document.querySelector("#analyze-button");
const trustScore = document.querySelector("#trust-score");
const heroScore = document.querySelector("#hero-score");
const riskLabel = document.querySelector("#risk-label");
const scoreCard = document.querySelector("#score-card");
const citationSummary = document.querySelector("#citation-summary");
const hallucinationSummary = document.querySelector("#hallucination-summary");
const biasSummary = document.querySelector("#bias-summary");
const answer = document.querySelector("#answer");
const evidenceList = document.querySelector("#evidence-list");
const corpusList = document.querySelector("#corpus-list");

function renderEvidence(docs) {
  evidenceList.innerHTML = docs.length
    ? docs
        .map(
          (doc, index) => `
            <article class="source-item">
              <div>
                <strong>[S${index + 1}] ${doc.title}</strong>
                <span>${doc.jurisdiction} · ${doc.type} · similarity ${Math.round(doc.score * 100)}%</span>
              </div>
              <p>${doc.excerpt}</p>
              <a href="${doc.sourceUrl}" target="_blank" rel="noreferrer">${doc.citation}</a>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No source crossed the retrieval threshold. Add more verified documents or rephrase the query.</p>`;
}

function renderCorpus() {
  corpusList.innerHTML = LEGAL_CORPUS.map(
    (doc) => `
      <article>
        <span>${doc.type}</span>
        <h3>${doc.title}</h3>
        <p>${doc.text}</p>
        <a href="${doc.sourceUrl}" target="_blank" rel="noreferrer">${doc.citation}</a>
      </article>
    `
  ).join("");
}

function setScoreState(trust) {
  trustScore.textContent = trust.score;
  heroScore.textContent = trust.score;
  riskLabel.textContent = trust.label;
  scoreCard.dataset.level = trust.level;
}

function analyze() {
  const prefix = matterType.value === "research-query" ? "Research query: " : "";
  const result = analyzeLegalInput(`${prefix}${input.value}`);
  setScoreState(result.trust);
  citationSummary.textContent = result.citationResult.summary;
  hallucinationSummary.textContent = result.hallucinationResult.summary;
  biasSummary.textContent = result.biasResult.summary;
  answer.innerHTML = result.answer;
  renderEvidence(result.retrievedDocs);
}

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = examples[button.dataset.example];
    matterType.value = button.dataset.example === "constitutional" ? "research-query" : "ai-output";
    analyze();
  });
});

analyzeButton.addEventListener("click", analyze);

input.value = examples.avianca;
renderCorpus();
analyze();
