const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const input = document.querySelector("#message-input");
const fileInput = document.querySelector("#file-input");
const attachButton = document.querySelector("#attach-button");
const recordButton = document.querySelector("#record-button");
const tray = document.querySelector("#attachment-tray");
const newChatButton = document.querySelector("#new-chat");
const clearHistoryButton = document.querySelector("#clear-history");
const historyList = document.querySelector("#history-list");

const STORAGE_KEY = "lexguard-conversations-v3";
const ACTIVE_KEY = "lexguard-active-conversation-v3";

const samplePrompts = [
  "Verify this: In Mata v. Avianca, lawyers have no duty to verify ChatGPT citations.",
  "Is this Article 21 argument legally supported by Maneka Gandhi?",
  "Because she is female, the witness is naturally emotional and less credible. Check this legal risk."
];

let conversations = [];
let activeId = "";
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

function nowLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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

function activeConversation() {
  return conversations.find((chat) => chat.id === activeId);
}

function saveConversations() {
  conversations = conversations
    .map((chat) => ({
      ...chat,
      messages: chat.messages.slice(-80)
    }))
    .slice(-30);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  localStorage.setItem(ACTIVE_KEY, activeId);
  renderHistoryList();
}

function welcomeHtml() {
  return `
    <p>Send a legal issue, illegal issue, citation, court filing excerpt, or source file. I will retrieve verified material first, then return a cited score-backed legal response.</p>
    <div class="prompt-grid">
      ${samplePrompts.map((prompt) => `<button class="prompt-chip" type="button">${escapeHtml(prompt)}</button>`).join("")}
    </div>
  `;
}

function createConversation() {
  const createdAt = new Date().toISOString();
  const chat = {
    id: crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}`,
    title: "New legal check",
    createdAt,
    updatedAt: createdAt,
    messages: [{ role: "assistant", html: welcomeHtml() }]
  };
  conversations.unshift(chat);
  activeId = chat.id;
  saveConversations();
  renderActiveConversation();
}

function loadConversations() {
  try {
    conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    conversations = [];
  }

  activeId = localStorage.getItem(ACTIVE_KEY) || conversations[0]?.id || "";
  if (!conversations.length || !conversations.some((chat) => chat.id === activeId)) {
    createConversation();
    return;
  }

  renderHistoryList();
  renderActiveConversation();
}

function titleFromMessage(message, files) {
  if (message.trim()) {
    return message.trim().replace(/\s+/g, " ").slice(0, 58);
  }
  if (files.length) return `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`;
  return "Legal check";
}

function renderHistoryList() {
  historyList.innerHTML = conversations.length
    ? conversations
        .map(
          (chat) => `
            <button class="history-item ${chat.id === activeId ? "active" : ""}" data-chat-id="${chat.id}" type="button">
              <strong>${escapeHtml(chat.title)}</strong>
              <small>${nowLabel(chat.updatedAt)}</small>
            </button>
          `
        )
        .join("")
    : `<p class="empty-history">No saved chats yet.</p>`;
}

function renderActiveConversation() {
  const chat = activeConversation();
  messages.innerHTML = "";
  if (!chat) {
    createConversation();
    return;
  }

  chat.messages.forEach((message) => appendDomMessage(message.role, message.html));
  scrollDown();
}

function appendDomMessage(role, html) {
  const row = document.createElement("article");
  row.className = `message ${role}`;
  row.dataset.role = role;
  row.innerHTML = `
    <div class="avatar">${role === "user" ? "You" : "LG"}</div>
    <div class="bubble">${html}</div>
  `;
  messages.append(row);
  return row;
}

function addMessage(role, html) {
  const chat = activeConversation();
  const row = appendDomMessage(role, html);

  if (chat) {
    chat.messages.push({ role, html });
    chat.updatedAt = new Date().toISOString();
    saveConversations();
  }

  scrollDown();
  return row;
}

function updateMessage(row, html) {
  const chat = activeConversation();
  row.querySelector(".bubble").innerHTML = html;

  if (chat) {
    const index = [...messages.children].indexOf(row);
    if (chat.messages[index]) {
      chat.messages[index].html = html;
      chat.updatedAt = new Date().toISOString();
      saveConversations();
    }
  }

  scrollDown();
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

function persistedFileSummary(files) {
  if (!files.length) return "";
  return `
    <div class="saved-files">
      ${files
        .map(
          (item) => `
            <div class="saved-file">
              <span>${escapeHtml(item.kind)}</span>
              <strong>${escapeHtml(item.file.name)}</strong>
              <small>${sizeLabel(item.file.size)}</small>
            </div>
          `
        )
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
  const waiting = addMessage("assistant", `<p class="muted">Retrieving verified legal sources...</p>`);
  const response = await fetch("/api/analyze", {
    method: "POST",
    body: buildFormData(message, files)
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const result = await response.json();
  updateMessage(waiting, renderResult(result));
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
  const chat = activeConversation();
  if (chat && chat.title === "New legal check") {
    chat.title = titleFromMessage(message, files);
  }

  addMessage("user", `${message ? `<p>${escapeHtml(message)}</p>` : "<p>Attached material for verification.</p>"}${persistedFileSummary(files)}`);

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

historyList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-chat-id]");
  if (!item) return;
  activeId = item.dataset.chatId;
  saveConversations();
  renderActiveConversation();
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

newChatButton.addEventListener("click", createConversation);

clearHistoryButton.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  conversations = [];
  activeId = "";
  try {
    await fetch("/api/history", { method: "DELETE" });
  } catch {
    // Browser-side history is already cleared.
  }
  createConversation();
});

fileInput.accept = "image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.rtf,.csv,.md,.json";
loadConversations();
resizeInput();
