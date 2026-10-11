export function normalizeServiceUrl(value) {
  const url = new URL(value.trim());
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("请使用 HTTPS 服务地址；本机测试可使用 http://localhost:8787。");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("服务地址不能包含账号、密码、查询参数或锚点。");
  }
  return url.href.replace(/\/+$/, "");
}

export async function readEvents(body, onEvent) {
  if (!body) throw new Error("服务没有返回回答流。");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let data = [];
  const dispatch = () => {
    if (data.length) {
      const raw = data.join("\n");
      if (raw !== "[DONE]") onEvent(eventName, JSON.parse(raw));
    }
    eventName = "message";
    data = [];
  };
  const consumeLine = line => {
    if (line === "") dispatch();
    else if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        consumeLine(buffer.slice(0, newline).replace(/\r$/, ""));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 2_000_000) throw new Error("服务返回的数据过大。");
      if (done) break;
    }
    if (buffer) consumeLine(buffer.replace(/\r$/, ""));
    dispatch();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function checkResponse(response) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || "问答服务请求失败（" + response.status + "）。");
}

export async function connectService(baseUrl, key, signal) {
  const response = await fetch(baseUrl + "/api/config", {
    headers: { Authorization: "Bearer " + key },
    signal,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  return (await checkResponse(response)).json();
}

export async function askService(baseUrl, key, question, sessionId, signal, onEvent) {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId || undefined }),
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  await checkResponse(response);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("服务没有返回有效的回答流。");
  }
  let complete = false;
  await readEvents(response.body, (event, data) => {
    if (event === "error") throw new Error(data.message || "回答生成失败。");
    if (event === "done") complete = true;
    onEvent(event, data);
  });
  if (!complete) throw new Error("回答连接中断，请重新提问。");
}
