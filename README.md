# KAMISATO

个人网站欢迎页，域名 `kamisato.me`。原生 HTML / CSS / JavaScript，无构建步骤，不依赖外部字体或 CDN。

## 本地预览

```sh
python3 -m http.server 8000
```

打开 `http://localhost:8000`。也可直接打开 `index.html` 查看页面。

## 页面

- `KAMISATO.txt`：UTF-8 艺术字源文件，保留供修改和重新生成。
- `assets/kamisato-wordmark.svg`：由源文件转换成的字形轮廓。页面使用这个 SVG，图形不含 SVG 文本或外部字体引用，避免安卓字体回退造成方块字符缺失、错位。缩放由 CSS 完成，关闭 JavaScript 也能显示艺术字。
- `styles.css`：深色布局，艺术字在页面上半部，密钥输入框在下半部，适配窄屏。
- `script.js`：缓慢流动的像素背景、鼠标交互和口令校验。右下角按钮可以暂停背景；系统开启“减少动态效果”时默认暂停；后台标签页停止渲染。

修改 `KAMISATO.txt` 后，重新生成 SVG 并一起发布：

```sh
python3 -m pip install -r tools/requirements.txt
python3 tools/generate_wordmark.py
```

转换工具在 macOS 上默认使用 Menlo 字体轮廓；其他环境可以通过 `--font /path/to/font.ttf` 指定包含这些字符的字体。转换依赖只在生成时使用，网站运行无需安装字体或 Python 包。

## 静态入口口令

默认口令为 `KAMISATO`，区分大小写。输入正确后进入“空间正在构建中”的占位区域，后续可以在 `#unlocked-space` 中扩展内容。当前标签页刷新时保留解锁状态，点击“返回入口”清除状态。

更换口令：

```sh
python3 tools/set_access_key.py
```

按提示输入两次新口令，再发布修改后的 `site.config.js`。配置只保存 SHA-256 摘要，输入的明文口令不会发往服务器，也不会保存在浏览器存储中。更换摘要后，旧会话在刷新时失效。

这是按当前需求实现的前端入口门槛，并不提供真正的访问权限保护。GitHub Pages 上的静态资源仍可直接访问，前端校验可以被绕过；不要将需要保密的内容或真实服务的 API Key 放到这个公开仓库。未来需要真正保护内容时，应改为服务端验证并保护内容接口。
