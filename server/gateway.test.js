import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createGateway } from "./gateway.js";
import { createPreview } from "./preview.js";
import { askService, connectService } from "../chat-client.js";

async function listen(server, t) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return "http://127.0.0.1:" + server.address().port;
}

async function fixture(t, options = {}) {
  const calls = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    calls.push({ path: request.url, auth: request.headers.authorization, body });
    if (options.handler) return options.handler(request, response, body);
    if (request.url.endsWith("/info")) {
      response.setHeader("Content-Type", "application/json");
      return response.end(JSON.stringify({ code: 0, data: { title: "Obsidian-note", prologue: "欢迎" } }));
    }
    response.setHeader("Content-Type", "text/event-stream");
    const frames = [
      {code: 0, data: {session_id: "upstream-private-session", answer: "第一段"}},
      {code: 0, data: {answer: "中文回答"}},
      {code: 0, data: {answer: "", final: true, reference: {chunks: [{document_name: "notes.md", content: "笔记原文", api_key: "should-not-leak"}]}}},
      {code: 0, data: true},
    ];
    response.end(frames.map(frame => "data: " + JSON.stringify(frame) + "\n\n").join("") + "data: [DONE]\n\n");
  });
  const upstreamUrl = await listen(upstream, t);
  const config = {
    ragflowUrl: upstreamUrl,
    apiKey: "private-ragflow-key",
    chatId: "fixed-chat-id",
    accessKey: "website-key",
    origins: ["https://kamisato.me"],
    ...options.config,
  };
  const gateway = createGateway(config);
  const address = await listen(gateway, t);
  const headers = {Authorization: "Bearer website-key", "Content-Type": "application/json", Origin: "https://kamisato.me"};
  return { calls, gateway, address, headers };
}

test("only the allowed origin and website key can access configuration", async t => {
  const { address, headers, calls } = await fixture(t);
  assert.equal((await fetch(address + "/api/config")).status, 401);
  const denied = await fetch(address + "/api/config", {headers: {...headers, Origin: "https://evil.example"}});
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const response = await fetch(address + "/api/config", {headers});
  assert.equal(response.headers.get("access-control-allow-origin"), "https://kamisato.me");
  const body = await response.json();
  assert.equal(body.title, "Obsidian-note");
  assert.ok(!JSON.stringify(body).includes("private-ragflow-key"));
  assert.equal(calls[0].auth, "Bearer private-ragflow-key");
  const preflight = await fetch(address + "/api/chat", {
    method: "OPTIONS",
    headers: {Origin: "https://kamisato.me", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
  });
  assert.equal(preflight.status, 204);
  const unknown = await fetch(address + "/api/chat", {method: "OPTIONS", headers: {Origin: "https://kamisato.me", "Access-Control-Request-Method": "DELETE"}});
  assert.equal(unknown.status, 403);
});

test("real browser client receives deltas, sources and an opaque multi-turn session", async t => {
  const { address, calls } = await fixture(t);
  assert.equal((await connectService(address, "website-key")).title, "Obsidian-note");
  const events = [];
  await askService(address, "website-key", "我的笔记是什么？", null, undefined, (event, data) => events.push([event, data]));
  const session = events.find(([event]) => event === "session")[1].session_id;
  assert.notEqual(session, "upstream-private-session");
  assert.equal(events.filter(([event]) => event === "delta").map(([, data]) => data.text).join(""), "第一段中文回答");
  assert.deepEqual(events.find(([event]) => event === "sources")[1], {sources: [{index: 0, document: "notes.md", content: "笔记原文"}]});
  assert.ok(!JSON.stringify(events).includes("should-not-leak"));
  await askService(address, "website-key", "再讲一下", session, undefined, () => {});
  assert.equal(calls.at(-1).body.session_id, "upstream-private-session");
  assert.equal(calls.at(-1).path, "/api/v1/chatbots/fixed-chat-id/completions");
  assert.equal(calls.at(-1).body.quote, true);
  assert.equal(calls.at(-1).body.internet, false);
});

test("rejects invalid sessions, empty questions, large bodies and upstream routing overrides", async t => {
  const { address, headers, calls } = await fixture(t);
  const request = body => fetch(address + "/api/chat", {method: "POST", headers, body: JSON.stringify(body)});
  assert.equal((await request({question: ""})).status, 400);
  assert.equal((await request({question: "问", session_id: "upstream-private-session"})).status, 410);
  assert.equal((await request({question: "x".repeat(40_000)})).status, 413);
  const valid = await request({question: "问", chat_id: "other", api_key: "evil", internet: true});
  await valid.text();
  assert.equal(calls.at(-1).path, "/api/v1/chatbots/fixed-chat-id/completions");
  assert.equal(calls.at(-1).body.api_key, undefined);
  assert.equal(calls.at(-1).body.internet, false);
});

test("sanitizes upstream errors rather than leaking its response or credentials", async t => {
  const { address, headers } = await fixture(t, {
    handler(_request, response) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({code: 102, message: "private-ragflow-key SQL internal path"}));
    },
  });
  const response = await fetch(address + "/api/config", {headers});
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private-ragflow-key"));
});

test("rate limit bounds paid model calls", async t => {
  const { address, headers, calls } = await fixture(t, {config: {requestsPerMinute: 1}});
  const options = {method: "POST", headers, body: JSON.stringify({question: "问"})};
  await (await fetch(address + "/api/chat", options)).text();
  assert.equal((await fetch(address + "/api/chat", options)).status, 429);
  assert.equal(calls.length, 1);
});

test("a disconnected browser cancels the upstream generation", async t => {
  let upstreamClosed;
  const closed = new Promise(resolve => { upstreamClosed = resolve; });
  const { address } = await fixture(t, {
    handler(_request, response) {
      response.setHeader("Content-Type", "text/event-stream");
      response.write('data: {"code":0,"data":{"answer":"开始","session_id":"private"}}\n\n');
      response.on("close", upstreamClosed);
    },
  });
  const controller = new AbortController();
  const response = await fetch(address + "/api/chat", {
    method: "POST", signal: controller.signal,
    headers: {Authorization: "Bearer website-key", "Content-Type": "application/json"},
    body: JSON.stringify({question: "问"}),
  });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => {});
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error("upstream not cancelled")), 1500).unref())]);
});

test("local preview never serves backend credentials, git files or server source", async t => {
  const address = await listen(createPreview(), t);
  assert.equal((await fetch(address + "/")).status, 200);
  assert.equal((await fetch(address + "/chat-client.js")).status, 200);
  for (const path of ["/server/.env", "/server/.cloudflared-command", "/server/.cloudflared-token", "/.git/config", "/server/gateway.js", "/../server/.env", "/%2e%2e/server/.env"]) {
    assert.equal((await fetch(address + path)).status, 404);
  }
});
