import test from "node:test";
import assert from "node:assert/strict";
import { normalizeServiceUrl, readEvents } from "../chat-client.js";

test("service URL permits HTTPS and local preview, rejects credentials and mixed content", () => {
  assert.equal(normalizeServiceUrl(" https://api.example.com/ "), "https://api.example.com");
  assert.equal(normalizeServiceUrl("http://localhost:8787/"), "http://localhost:8787");
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com?key=secret", "javascript:alert(1)"]) {
    assert.throws(() => normalizeServiceUrl(value));
  }
});

test("SSE parser handles byte-fragmented Chinese text, CRLF, comments and completion markers", async () => {
  const bytes = new TextEncoder().encode(': ping\r\nevent: delta\r\ndata: {"text":"中文回答"}\r\n\r\nevent: done\ndata: {"ok":true}\n\ndata: [DONE]\n\n');
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  await readEvents(body, (event, data) => events.push([event, data]));
  assert.deepEqual(events, [["delta", {text: "中文回答"}], ["done", {ok: true}]]);
});

test("SSE parser propagates malformed payloads and consumer failures", async () => {
  const makeBody = text => new Blob([text]).stream();
  await assert.rejects(readEvents(makeBody("data: {broken}\n\n"), () => {}));
  await assert.rejects(readEvents(makeBody('event: error\ndata: {"message":"failed"}\n\n'),
    () => { throw new Error("failed"); }), /failed/);
});
