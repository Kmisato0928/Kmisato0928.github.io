# KAMISATO

个人网站，域名 `kamisato.me`。保留欢迎页，解锁后进入个人简历和问答工作台。原生 HTML / CSS / JavaScript，无构建步骤，不依赖外部字体或 CDN。

## 本地预览

```sh
npm run preview
```

安装 Node.js 24 或更高版本后，打开 `http://localhost:8088`。预览服务只提供公开网页文件，不会提供后端配置或密钥。网页使用 ES 模块，需要通过 HTTP 服务预览。

## 页面

- `KAMISATO.txt`：UTF-8 艺术字源文件，保留供修改和重新生成。
- `assets/kamisato-wordmark.svg`：由源文件转换成的字形轮廓。页面使用这个 SVG，图形不含 SVG 文本或外部字体引用，避免安卓字体回退造成方块字符缺失、错位。缩放由 CSS 完成，关闭 JavaScript 也能显示艺术字。
- `styles.css`：深色布局，艺术字在页面上半部，密钥输入框在下半部，适配窄屏。
- `script.js`：缓慢流动的像素背景、鼠标交互和口令校验。右下角按钮可以暂停背景；系统开启“减少动态效果”时默认暂停；后台标签页停止渲染。
- `workspace.css` / `workspace.js`：解锁后的工作区。最左侧切换简历与问答；桌面简历为分类 / 内容两栏，手机分类为横向导航。问答连接配置可收起，在手机上作为默认关闭的抽屉显示。
- `resume.data.js`：统一维护技术概览、5 类个人技能、4 个个人项目、3 个实习研发项目和教育经历。页面仅使用 KAMISATO 作为显示名，不包含真实姓名、求职意向、私人联系方式或原始简历 PDF。项目按个人项目 / 实习研发分组，原型及测试性验证保持明确标注。

## 问答工作台

问答页面调用 Linux 上的问答网关，网关再调用 RAGFlow 中绑定知识库的聊天助手。支持实时流式回答、Markdown 排版、笔记出处、连续对话、停止生成、复制回答和新建对话。

示例问题：

> ShadowBox 的 shadow 空间有哪些内存读写监控方案？请比较触发机制与覆盖边界，并说明实现状态。

在连接配置中填写网站服务访问密钥，点击“连接知识库”。服务地址默认填入 `https://api.kamisato.me`，经 Cloudflare Tunnel 连接 Linux 问答网关；需要绕过公网直连本机时，手动改为 `http://localhost:8787`。连接成功后显示实际的 RAGFlow 助手名称。浏览器仅在内存中保存访问密钥，刷新或退出工作区后清除。

DeepSeek 和 Embedding 服务的密钥保存在 RAGFlow 中。网站访问密钥是网关配置中的 `SITE_ACCESS_KEY`；`RAGFLOW_API_KEY` 是 Linux 网关访问 RAGFlow 的凭据，两者用途不同，均不能写进公开网页或提交到 Git。

## Linux 问答服务

网关使用 Node.js 原生 HTTP 服务，无需安装 npm 依赖。先根据 `server/.env.example` 准备私有 `server/.env`：

- `RAGFLOW_BASE_URL`：RAGFlow 地址；直接运行 Node 时默认为 `http://127.0.0.1:9380`。
- `RAGFLOW_CHAT_ID`：绑定笔记知识库的聊天助手 ID，不是知识库 ID。
- `RAGFLOW_API_KEY`：在 RAGFlow 用户设置的 API 页面创建。
- `SITE_ACCESS_KEY`：自行生成的独立高强度网站访问密钥。
- `ALLOWED_ORIGINS`：允许请求的网站来源，精确到协议和域名；本机预览默认使用 8088 端口。

`server/.env` 已被 Git 忽略，应设置为仅当前用户可读写。GitHub Pages 的 `_config.yml` 排除了整个 `server/` 目录。

本机已运行默认 RAGFlow Compose 环境时，用 Docker 启动：

```sh
docker compose -f server/compose.yml up -d
```

这会启动问答网关和网站本机预览：

- 网页：`http://localhost:8088`
- 问答网关：`http://localhost:8787`
- 状态：`http://localhost:8787/health`

网关通过现有 `docker_ragflow` 网络访问 RAGFlow，两个端口只绑定本机回环地址。Docker 服务依赖 RAGFlow 已启动；如 RAGFlow 网络名称改变，同步更新 `server/compose.yml`。

```sh
docker compose -f server/compose.yml ps
docker compose -f server/compose.yml logs --tail 50 gateway
docker compose -f server/compose.yml stop
docker compose -f server/compose.yml start
```

直接使用主机 Node.js 运行网关可执行 `npm run server`；不要与 Docker 网关同时占用 8787 端口。

## Cloudflare 公网入口

Cloudflare 中创建命名隧道，在本机私有 `server/.cloudflared-token` 文件中保存该隧道的 Token，文件权限设为 `600`。该文件与临时接收命令的 `server/.cloudflared-command` 均被 Git 忽略，不能提交。Token 通过 Docker secret 文件挂载，不写入启动参数或公开配置。

```sh
docker compose -f server/compose.yml --profile public up -d
docker compose -f server/compose.yml --profile public ps
docker compose -f server/compose.yml --profile public stop
docker compose -f server/compose.yml --profile public start
```

本机默认启动命令不启用 `public` profile；公网启动命令额外运行 `cloudflared`。隧道容器与问答网关共用独立的 `tunnel` 网络，不加入 `docker_ragflow` 网络，不发布主机端口。隧道使用 TCP HTTP/2 连接 Cloudflare。

在 Cloudflare 隧道中添加 Published application 路由：公网主机名为 `api.kamisato.me`，Service URL 为 `http://gateway:8787`。这是容器网络内的地址，不填写 `localhost`。路由只能指向问答网关，不要公开 RAGFlow 管理页面或数据库。

`site.config.js` 的 `chatServiceUrl` 已设为 `https://api.kamisato.me`。网站实际来源必须在 `ALLOWED_ORIGINS` 中。GitHub Pages 只部署静态网页，不能启动 `server/` 内的进程。曾经分享过的网站访问密钥已经更换，服务密钥只保存在私有配置中。

网关固定访问配置中的一个聊天助手，提供 `/api/config` 和 `/api/chat`，不转发其他管理接口。网站请求需通过服务密钥验证，默认每分钟最多 20 次提问、同时最多 2 次生成。停止或关闭连接会取消上游请求。会话映射保存在网关内存中，重启网关后需在网页点击“新对话”。

运行针对性测试：

```sh
npm ci
npm test
```

修改 `KAMISATO.txt` 后，重新生成 SVG 并一起发布：

```sh
python3 -m pip install -r tools/requirements.txt
python3 tools/generate_wordmark.py
```

转换工具在 macOS 上默认使用 Menlo 字体轮廓；其他环境可以通过 `--font /path/to/font.ttf` 指定包含这些字符的字体。转换依赖只在生成时使用，网站运行无需安装字体或 Python 包。

## 静态入口口令

默认口令为 `KAMISATO`，区分大小写。输入正确后直接进入个人简历，使用最左侧按钮切换问答工作台。当前标签页刷新时保留解锁状态，点击最左下侧“返回欢迎页”按钮清除状态。

更换口令：

```sh
python3 tools/set_access_key.py
```

按提示输入两次新口令，再发布修改后的 `site.config.js`。配置只保存 SHA-256 摘要，输入的明文口令不会发往服务器，也不会保存在浏览器存储中。更换摘要后，旧会话在刷新时失效。

这是前端入口门槛，GitHub Pages 上的静态资源仍可直接访问。真实笔记问答接口由 Linux 网关独立验证网站服务访问密钥；不要将需要保密的内容或真实服务的 API Key 放到公开仓库。
