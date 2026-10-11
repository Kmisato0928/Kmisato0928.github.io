import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createGateway } from "./gateway.js";

const envFile = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);
const server = createGateway({
  ragflowUrl: process.env.RAGFLOW_BASE_URL || "http://127.0.0.1:9380",
  apiKey: process.env.RAGFLOW_API_KEY || "",
  chatId: process.env.RAGFLOW_CHAT_ID || "",
  accessKey: process.env.SITE_ACCESS_KEY || "",
  origins: (process.env.ALLOWED_ORIGINS || "https://kamisato.me,https://www.kamisato.me,https://kmisato0928.github.io,http://localhost:8088,http://127.0.0.1:8088").split(",").map(value => value.trim()).filter(Boolean),
});
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => console.log("KAMISATO Linux 问答服务已启动：" + host + ":" + port));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
