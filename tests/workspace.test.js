import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const source = name => readFileSync(new URL(name, root), "utf8");

function page(t, fetchImpl, {url = "http://localhost:8088/", configSource = ""} = {}) {
  const dom = new JSDOM(source("index.html"), {url, runScripts: "outside-only", pretendToBeVisual: true});
  t.after(() => dom.window.close());
  const { window } = dom;
  window.KAMISATO_CONFIG = {};
  window.matchMedia = () => ({matches: false, addEventListener() {}});
  window.AbortController = AbortController;
  window.AbortSignal = AbortSignal;
  window.TextDecoder = TextDecoder;
  window.fetch = fetchImpl;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  const context = dom.getInternalVMContext();
  if (configSource) runInContext(configSource, context);
  runInContext(source("resume.data.js"), context);
  runInContext(source("chat-client.js").replaceAll("export ", ""), context);
  runInContext(source("markdown.js").replaceAll("export ", ""), context);
  runInContext(source("workspace.js").replace(/^import .*;\n/gm, ""), context);
  const document = window.document;
  document.querySelector("#workspace").hidden = false;
  document.querySelector('[data-workspace-view="chat"]').click();
  return {window, document};
}

async function until(check) {
  const deadline = Date.now() + 1000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("UI did not reach expected state");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function connect(document) {
  const key = document.querySelector("#service-key");
  key.value = "website-test-key";
  key.dispatchEvent(new document.defaultView.Event("input", {bubbles: true}));
  document.querySelector("#connection-form").dispatchEvent(new document.defaultView.Event("submit", {bubbles: true, cancelable: true}));
  await until(() => !document.querySelector("#connection-save").disabled);
}

function ask(document, question) {
  const input = document.querySelector("#question-input");
  input.value = question;
  input.dispatchEvent(new document.defaultView.Event("input", {bubbles: true}));
  document.querySelector("#question-form").dispatchEvent(new document.defaultView.Event("submit", {bubbles: true, cancelable: true}));
}

function eventStream(events) {
  return new Response(events.map(([event, data]) => "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n").join(""), {headers: {"Content-Type": "text/event-stream"}});
}

test("deployed site prefills its public HTTPS gateway without storing a service key", async t => {
  const requests = [];
  const {document, window} = page(t, async url => {
    requests.push(url);
    return Response.json({title: "Obsidian-note"});
  }, {url: "https://kamisato.me/", configSource: source("site.config.js")});
  assert.equal(document.querySelector("#service-url").value, "https://api.kamisato.me");
  assert.equal(document.querySelector("#service-key").value, "");
  await connect(document);
  assert.deepEqual(requests, ["https://api.kamisato.me/api/config"]);
  assert.equal(document.querySelector("#connection-status").dataset.state, "connected");
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
});

test("page connects, renders live Markdown and citations, and keeps multi-turn sessions", async t => {
  const requests = [];
  const {document} = page(t, async (url, options) => {
    if (url.endsWith("/api/config")) return Response.json({title: "Obsidian-note"});
    requests.push(JSON.parse(options.body));
    return eventStream([
      ["session", {session_id: "public-session"}],
      ["delta", {text: "## 笔记回答\n**API 监控** [ID:0]\n\n<img src=x onerror=alert(1)>\n"}],
      ["sources", {sources: [{index: 0, document: "shadow_box.md", content: "笔记原文"}]}],
      ["done", {session_id: "public-session"}],
    ]);
  });
  assert.equal(document.querySelector("#service-url").value, "http://localhost:8787");
  assert.equal(document.querySelector("#question-input").disabled, true);
  await connect(document);
  assert.equal(document.querySelector("#connection-status").dataset.state, "connected");
  assert.equal(document.querySelector("#question-input").disabled, false);
  ask(document, "第一问");
  await until(() => document.querySelector(".rag-sources"));
  assert.equal(document.querySelector(".chat-answer strong").textContent, "API 监控");
  assert.equal(document.querySelector(".chat-answer h3").textContent, "笔记回答");
  assert.equal(document.querySelector(".chat-answer img"), null);
  document.querySelector(".rag-citation").click();
  assert.equal(document.querySelector(".rag-sources").open, true);
  assert.equal(document.querySelector(".rag-source-item h3").textContent, "shadow_box.md");
  ask(document, "第二问");
  await until(() => requests.length === 2 && document.querySelectorAll(".message-footer").length === 2);
  assert.equal(requests[1].session_id, "public-session");
  document.querySelector("#new-conversation").click();
  assert.equal(document.querySelector("#conversation").children.length, 0);
  ask(document, "新会话");
  await until(() => requests.length === 3 && document.querySelector(".message-footer"));
  assert.equal(requests[2].session_id, undefined);
});

test("failed authentication disables chat and explains the error", async t => {
  const {document} = page(t, async () => Response.json({error: "服务访问密钥不正确。"}, {status: 401}));
  await connect(document);
  assert.equal(document.querySelector("#connection-status").dataset.state, "error");
  assert.equal(document.querySelector("#question-input").disabled, true);
  assert.equal(document.querySelector("#connection-message").textContent, "服务访问密钥不正确。");
});

test("stopping generation aborts the request and preserves partial answer", async t => {
  let signal;
  const {document} = page(t, async (url, options) => {
    if (url.endsWith("/api/config")) return Response.json({title: "Obsidian-note"});
    signal = options.signal;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"已收到的内容"}\n\n'));
        signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), {once: true});
      },
    });
    return new Response(body, {headers: {"Content-Type": "text/event-stream"}});
  });
  await connect(document);
  ask(document, "提问");
  await until(() => document.querySelector(".is-assistant .message-content")?.textContent === "已收到的内容");
  document.querySelector("#question-form").dispatchEvent(new document.defaultView.Event("submit", {bubbles: true, cancelable: true}));
  assert.equal(signal.aborted, true);
  assert.equal(document.querySelector(".is-assistant .message-content").textContent, "已收到的内容");
  assert.equal(document.querySelector(".message-note").textContent, "已停止生成。");
});

test("editing credentials disconnects; locking clears the key without browser persistence", async t => {
  const {document, window} = page(t, async () => Response.json({title: "Obsidian-note"}));
  await connect(document);
  document.querySelector("#service-url").dispatchEvent(new window.Event("input", {bubbles: true}));
  assert.equal(document.querySelector("#question-input").disabled, true);
  await connect(document);
  document.dispatchEvent(new window.CustomEvent("kamisato:access-change", {detail: {unlocked: false}}));
  assert.equal(document.querySelector("#service-key").value, "");
  assert.equal(document.querySelector("#question-input").disabled, true);
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
});

test("Markdown supports safe code blocks, tables and text-only HTML", t => {
  const {document, window} = page(t, async () => Response.json({}));
  const container = document.createElement("div");
  window.renderMarkdown(container, "### 标题\n\n~~~js\n<script>alert(1)</script>\n~~~\n\n|名称|内容|\n|---|---|\n|**粗体**|文本|\n\n[坏链接](javascript:alert(1))\n<script>恶意内容</script>");
  assert.equal(container.querySelector("pre code").textContent, "<script>alert(1)</script>");
  assert.equal(container.querySelector("table strong").textContent, "粗体");
  assert.equal(container.querySelector("script"), null);
  assert.equal(container.querySelector("a"), null);
});
