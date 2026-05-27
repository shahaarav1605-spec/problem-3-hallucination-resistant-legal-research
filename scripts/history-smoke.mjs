const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const appUrl = process.env.LEXGUARD_URL || "http://127.0.0.1:8000";
const pages = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = pages.find((item) => item.type === "page" && item.url.startsWith(appUrl));

if (!page) {
  throw new Error("LexGuard page was not found on the Chrome debug port.");
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};

await new Promise((resolve) => {
  socket.onopen = resolve;
});

function call(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await call("Runtime.enable");
await call("Page.enable");
await sleep(700);

await call("Runtime.evaluate", {
  expression: "localStorage.clear(); location.reload();"
});
await sleep(900);

await call("Runtime.evaluate", {
  expression:
    "document.querySelector('#message-input').value='What does Article 21 say about personal liberty?'; document.querySelector('#message-input').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#composer').requestSubmit();"
});
await sleep(1800);

const snapshotExpression =
  "JSON.stringify({saved: JSON.parse(localStorage.getItem('lexguard-conversations-v3')||'[]').length, title: JSON.parse(localStorage.getItem('lexguard-conversations-v3')||'[]')[0]?.title, messages: document.querySelectorAll('.message').length, history: document.querySelectorAll('.history-item').length})";

const before = await call("Runtime.evaluate", {
  expression: snapshotExpression,
  returnByValue: true
});

await call("Runtime.evaluate", {
  expression: "location.reload();"
});
await sleep(1000);

const after = await call("Runtime.evaluate", {
  expression: snapshotExpression,
  returnByValue: true
});

console.log("before=", before.result.result.value);
console.log("after=", after.result.result.value);
socket.close();
