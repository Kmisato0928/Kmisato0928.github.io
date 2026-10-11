import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readEvents } from "../chat-client.js";

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function bodyJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw httpError(415, "请求必须使用 JSON 格式。");
  }
  const chunks = [];
  await new Promise((resolve, reject) => {
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > 32_768) reject(httpError(413, "问题过长，请缩短后重试。"));
      else chunks.push(chunk);
    });
    request.on("end", resolve);
    request.on("error", reject);
  });
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw httpError(400, "请求内容不是有效的 JSON 对象。");
  }
}

export function createGateway(config) {
  const origins = new Set(config.origins);
  const sessions = new Map();
  const accessHash = createHash("sha256").update(config.accessKey || "").digest();
  const upstreamBase = new URL(config.ragflowUrl);
  if (!["http:", "https:"].includes(upstreamBase.protocol) || upstreamBase.username || upstreamBase.password) {
    throw new Error("RAGFLOW_BASE_URL 必须是 HTTP 或 HTTPS 服务地址。");
  }
  const ready = Boolean(config.apiKey && config.chatId && config.accessKey);
  let activeRequests = 0;
  let rateWindow = Date.now();
  let rateCount = 0;

  async function upstream(path, options = {}) {
    return fetch(new URL(path, upstreamBase), {
      ...options,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  async function botInfo(signal) {
    const response = await upstream("/api/v1/chatbots/" + encodeURIComponent(config.chatId) + "/info", { signal });
    if (!response.ok) throw httpError(502, "无法连接 RAGFlow，请检查它是否正在运行。");
    const payload = await response.json();
    if (payload.code !== 0 || !payload.data?.title) {
      throw httpError(502, "RAGFlow 服务密钥或聊天助手配置无效，请检查后端配置。");
    }
    return { title: payload.data.title, prologue: payload.data.prologue || "", service: "kamisato-rag" };
  }

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const origin = request.headers.origin;
    if (origin) {
      if (!origins.has(origin)) return json(response, 403, { error: "此网站来源未获允许。" });
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Max-Age", "600");
      if (request.headers["access-control-request-private-network"] === "true") {
        response.setHeader("Access-Control-Allow-Private-Network", "true");
      }
    }
    const route = request.url?.split("?")[0];
    if (!["/health", "/api/config", "/api/chat"].includes(route)) return json(response, 404, { error: "接口不存在。" });
    if (request.method === "OPTIONS") {
      const allowedMethod = route === "/api/chat" ? "POST" : "GET";
      const headers = (request.headers["access-control-request-headers"] || "").toLowerCase().split(",").map(item => item.trim()).filter(Boolean);
      if (!origin || request.headers["access-control-request-method"] !== allowedMethod ||
          headers.some(item => !["authorization", "content-type"].includes(item))) {
        return json(response, 403, { error: "预检请求未获允许。" });
      }
      response.writeHead(204);
      return response.end();
    }
    if (route === "/health" && request.method === "GET") {
      return json(response, 200, { status: "ok", service: "kamisato-rag", configured: ready });
    }
    const auth = request.headers.authorization || "";
    const candidate = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const candidateHash = createHash("sha256").update(candidate).digest();
    if (!config.accessKey || !candidate || !timingSafeEqual(candidateHash, accessHash)) {
      return json(response, 401, { error: "服务访问密钥不正确。" });
    }
    if (!ready) return json(response, 503, { error: "Linux 问答服务尚未配置 RAGFlow 密钥和聊天助手。" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), config.timeoutMs || 180_000);
    response.on("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    let slot = null;
    let counted = false;
    try {
      if (route === "/api/config" && request.method === "GET") {
        return json(response, 200, await botInfo(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])));
      }
      if (route !== "/api/chat" || request.method !== "POST") {
        return json(response, 405, { error: "请求方法不支持。" });
      }
      const input = await bodyJson(request);
      if (typeof input.question !== "string" || !input.question.trim() || input.question.length > 6000) {
        throw httpError(400, "请输入 1 到 6000 个字符的问题。");
      }
      if (input.session_id != null && typeof input.session_id !== "string") {
        throw httpError(400, "会话参数无效。" );
      }
      const now = Date.now();
      for (const [id, item] of sessions) {
        if (!item.busy && now - item.updatedAt > 86_400_000) sessions.delete(id);
      }
      if (now - rateWindow >= 60_000) { rateWindow = now; rateCount = 0; }
      if (rateCount >= (config.requestsPerMinute || 20)) throw httpError(429, "提问过于频繁，请稍后重试。" );
      if (activeRequests >= (config.maxConcurrent || 2)) throw httpError(429, "问答服务繁忙，请稍后重试。" );
      const publicId = input.session_id || randomUUID();
      if (input.session_id) {
        slot = sessions.get(publicId);
        if (!slot) throw httpError(410, "会话已过期，请新建对话。" );
        if (slot.busy) throw httpError(409, "此会话正在生成回答，请稍后重试。" );
      } else {
        if (sessions.size >= 200) {
          const idleId = [...sessions].find(([, item]) => !item.busy)?.[0];
          if (!idleId) throw httpError(429, "会话数量已达上限，请稍后重试。" );
          sessions.delete(idleId);
        }
        slot = { upstreamId: "", updatedAt: now, busy: false };
        sessions.set(publicId, slot);
      }
      slot.busy = true;
      slot.updatedAt = now;
      activeRequests++;
      rateCount++;
      counted = true;
      const result = await upstream("/api/v1/chatbots/" + encodeURIComponent(config.chatId) + "/completions", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          question: input.question.trim(),
          session_id: slot.upstreamId,
          quote: true,
          stream: true,
          reasoning: false,
          internet: false,
        }),
      });
      if (!result.ok || !result.headers.get("content-type")?.includes("text/event-stream")) {
        await result.body?.cancel();
        throw httpError(502, "RAGFlow 未能开始回答，请检查助手配置或后端日志。" );
      }
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" });
      response.flushHeaders();
      const send = (event, data) => response.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
      send("session", { session_id: publicId });
      let finished = false;
      let thinking = false;
      const heartbeat = setInterval(() => { if (!response.destroyed) response.write(": keepalive\n\n"); }, 15_000);
      try {
        await readEvents(result.body, (_event, payload) => {
          if (payload.code !== 0) throw httpError(502, "RAGFlow 生成回答失败，请检查模型或检索配置。" );
          if (payload.data === true) { finished = true; return; }
          const data = payload.data;
          if (!data || typeof data !== "object") return;
          if (data.session_id) slot.upstreamId = data.session_id;
          if (data.start_to_think) { thinking = true; return; }
          if (data.end_to_think) { thinking = false; return; }
          if (thinking) return;
          if (typeof data.answer === "string" && data.answer) {
            if (data.answer.startsWith("**ERROR**")) throw httpError(502, "RAGFlow 模型调用失败，请检查助手配置。" );
            send(data.final ? "answer" : "delta", { text: data.answer });
          }
          const chunks = data.reference?.chunks;
          if (Array.isArray(chunks) && chunks.length) {
            send("sources", { sources: chunks.slice(0, 50).map((chunk, index) => ({
              index,
              document: String(chunk.document_name || chunk.docnm_kwd || "笔记"),
              content: String(chunk.content || chunk.content_with_weight || "").slice(0, 24_000),
            })) });
          }
        });
        if (!finished) throw httpError(502, "RAGFlow 回答流中断，请重试。" );
        send("done", { session_id: publicId });
        response.end();
      } finally {
        clearInterval(heartbeat);
      }
    } catch (error) {
      controller.abort();
      if (response.destroyed) return;
      const status = error.status || (controller.signal.reason?.message === "timeout" ? 504 : 502);
      const message = error.status ? error.message : (status === 504 ? "回答超时，请重试。" : "无法连接 RAGFlow，请确认服务正在运行。" );
      if (response.headersSent) {
        response.end("event: error\ndata: " + JSON.stringify({ message }) + "\n\n");
      } else {
        json(response, status, { error: message });
      }
    } finally {
      clearTimeout(timeout);
      if (slot && counted) { slot.busy = false; slot.updatedAt = Date.now(); }
      if (counted) activeRequests--;
    }
  });
  server.requestTimeout = 30_000;
  return server;
}
