const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const input = document.querySelector("#message-input");
const fileInput = document.querySelector("#file-input");
const attachButton = document.querySelector("#attach-button");
const recordButton = document.querySelector("#record-button");
const tray = document.querySelector("#attachment-tray");
const newChatButton = document.querySelector("#new-chat");
const clearHistoryButton = document.querySelector("#clear-history");

const LOCAL_HISTORY_KEY = "lexguard-chat-history";
const samplePrompts = [
  "Verify this: In Mata v. Avianca, lawyers have no duty to verify ChatGPT citations.",
  "Is this Article 21 argument legally supported by Maneka Gandhi?",
  "Because she is female, the witness is naturally emotional and less credible. Check this legal risk."
];

let pendingFiles = [];
let recorder = null;
let audioParts = [];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function scrollDown() {
  messages.scrollTop = messages.scrollHeight;
}

function saveLocalHistory() {
  const rows = [...messages.querySelectorAll(".message")].map((node) => ({
    role: node.dataset.role,
    html: node.querySelector(".bubble").innerHTML
  }));
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(rows.slice(-80)));
}

function addMessage(role, html, options = {}) {
  const row = document.createElement("article");
  row.className = `message ${role}`;
  row.dataset.role = role;
  row.innerHTML = `
    <div class="avatar">${role === "user" ? "You" : "LG"}</div>
    <div class="bubble">${html}</div>
  `;
  messages.append(row);
  if (!options.skipSave) saveLocalHistory();
  scrollDown();
  return row;
}

function seedChat() {
  messages.innerHTML = "";
  addMessage(
    "assistant",
    `
      <p>Send a legal issue, illegal issue, citation, or filing excerpt. I will use the FastAPI RAG backend to retrieve verified sources, score risk, and return only a verified legal response.</p>
      <div class="prompt-grid">
        ${samplePrompts.map((prompt) => `<button class="prompt-chip" type="button">${escapeHtml(prompt)}</button>`).join("")}
      </div>
    `
  );
}

function restoreLocalHistory() {
  const saved = localStorage.getItem(LOCAL_HISTORY_KEY);
  if (!saved) {
    seedChat();
    return;
  }

  try {
    const rows = JSON.parse(saved);
    messages.innerHTML = "";
    rows.forEach((item) => addMessage(item.role, item.html, { skipSave: true }));
    scrollDown();
  } catch {
    seedChat();
  }
}

function renderTray() {
  tray.hidden = pendingFiles.length === 0;
  tray.innerHTML = pendingFiles
    .map((item, index) => {
      const preview =
        item.kind === "image"
          ? `<img src="${item.url}" alt="">`
          : `<span class="file-type">${item.kind}</span>`;
      return `
        <div class="attachment-chip">
          ${preview}
          <div>
            <strong>${escapeHtml(item.file.name)}</strong>
            <small>${sizeLabel(item.file.size)}</small>
          </div>
          <button type="button" data-remove="${index}" aria-label="Remove file">x</button>
        </div>
      `;
    })
    .join("");
}

function addFiles(files) {
  [...files].forEach((file) => {
    pendingFiles.push({
      file,
      kind: fileKind(file),
      url: URL.createObjectURL(file)
    });
  });
  renderTray();
}

function renderSentFiles(files) {
  if (!files.length) return "";
  return `
    <div class="sent-files">
      ${files
        .map((item) => {
          if (item.kind === "image") {
            return `<figure><img src="${item.url}" alt="${escapeHtml(item.file.name)}"><figcaption>${escapeHtml(item.file.name)}</figcaption></figure>`;
          }
          if (item.kind === "video") {
            return `<figure><video src="${item.url}" controls></video><figcaption>${escapeHtml(item.file.name)}</figcaption></figure>`;
          }
          if (item.kind === "audio") {
            return `<figure><audio src="${item.url}" controls></audio><figcaption>${escapeHtml(item.file.name)}</figcaption></figure>`;
          }
          return `<div class="document-pill"><span>File</span><strong>${escapeHtml(item.file.name)}</strong><small>${sizeLabel(item.file.size)}</small></div>`;
        })
        .join("")}
    </div>
  `;
}

function buildFormData(message, files) {
  const formData = new FormData();
  formData.append("message", message);
  files.forEach((item) => formData.append("files", item.file));
  return formData;
}

function sourceList(sources) {
  if (!sources.length) return `<p class="muted">No verified source was retrieved.</p>`;
  return sources
    .slice(0, 4)
    .map(
      (source, index) => `
        <a class="source-card" href="${source.source_url}" target="_blank" rel="noreferrer">
          <strong>[S${index + 1}] ${escapeHtml(source.title)}</strong>
          <span>${escapeHtml(source.citation)} | ${Math.round(source.score * 100)}% match</span>
        </a>
      `
    )
    .join("");
}

function moduleRows(modules) {
  return `
    <div class="module-rows">
      <span><b>Citation verifier</b>${escapeHtml(modules.citation_verifier.summary)}</span>
      <span><b>Hallucination detector</b>${escapeHtml(modules.hallucination_detector.summary)}</span>
      <span><b>Bias flagger</b>${escapeHtml(modules.bias_flagger.summary)}</span>
    </div>
  `;
}

function renderResult(result) {
  return `
    <section class="score-card" data-level="${result.trust.level}">
      <div>
        <strong>${escapeHtml(result.trust.label)}</strong>
        <small>${escapeHtml(result.scope.summary)}</small>
      </div>
      <span>${result.trust.score}/100</span>
    </section>
    ${moduleRows(result.modules)}
    <p>${escapeHtml(result.response)}</p>
    <section class="sources">
      <h2>Verified sources</h2>
      ${sourceList(result.sources)}
    </section>
  `;
}

async function sendMessage(message, files) {
  const waiting = addMessage("assistant", `<p class="muted">Checking verified legal sources with FastAPI...</p>`);
  const response = await fetch("/api/analyze", {
    method: "POST",
    body: buildFormData(message, files)
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const result = await response.json();
  waiting.querySelector(".bubble").innerHTML = renderResult(result);
  saveLocalHistory();
}

async function startRecording() {
  if (recorder?.state === "recording") {
    recorder.stop();
    recordButton.textContent = "Mic";
    recordButton.classList.remove("recording");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    addMessage("assistant", "<p>Audio recording is not available in this browser. Attach an audio file instead.</p>");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioParts = [];
  recorder = new MediaRecorder(stream);
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) audioParts.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    const file = new File([new Blob(audioParts, { type: "audio/webm" })], "voice-note.webm", {
      type: "audio/webm"
    });
    addFiles([file]);
    stream.getTracks().forEach((track) => track.stop());
  });
  recorder.start();
  recordButton.textContent = "Stop";
  recordButton.classList.add("recording");
}

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

tray.addEventListener("click", (event) => {
  const index = event.target?.dataset?.remove;
  if (index === undefined) return;
  const [removed] = pendingFiles.splice(Number(index), 1);
  if (removed?.url) URL.revokeObjectURL(removed.url);
  renderTray();
});

recordButton.addEventListener("click", () => {
  startRecording().catch(() => {
    addMessage("assistant", "<p>I could not access the microphone. You can still upload an audio file.</p>");
  });
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message && pendingFiles.length === 0) return;

  const files = pendingFiles;
  addMessage("user", `${message ? `<p>${escapeHtml(message)}</p>` : "<p>Attached material for verification.</p>"}${renderSentFiles(files)}`);

  input.value = "";
  resizeInput();
  pendingFiles = [];
  renderTray();

  try {
    await sendMessage(message || "Verify the attached legal material.", files);
  } catch {
    addMessage("assistant", "<p>The FastAPI backend did not respond. Start the backend locally or deploy the project first.</p>");
  }
});

messages.addEventListener("click", (event) => {
  if (!event.target.classList.contains("prompt-chip")) return;
  input.value = event.target.textContent;
  resizeInput();
  input.focus();
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

newChatButton.addEventListener("click", seedChat);
clearHistoryButton.addEventListener("click", async () => {
  localStorage.removeItem(LOCAL_HISTORY_KEY);
  try {
    await fetch("/api/history", { method: "DELETE" });
  } catch {
    // Local history is already cleared; backend history can be cleared when the API is available.
  }
  seedChat();
});

fileInput.accept = "image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.rtf,.csv,.md,.json";
restoreLocalHistory();
resizeInput();
