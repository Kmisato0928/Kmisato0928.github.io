#!/usr/bin/env python3
"""替换静态入口口令的 SHA-256 摘要，不将口令写入仓库。"""

import getpass
import hashlib
import re
from pathlib import Path


def main():
    password = getpass.getpass("新的入口口令（输入不会显示）: ")
    if not password.strip() or len(password) > 256:
        raise SystemExit("口令不能为空，且不超过 256 个字符。")
    if password != getpass.getpass("再次输入: "):
        raise SystemExit("两次输入不一致，配置未修改。")
    config = Path(__file__).resolve().parent.parent / "site.config.js"
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    text, count = re.subn(r'accessKeyHash: "[a-f0-9]{64}"', f'accessKeyHash: "{digest}"', config.read_text(encoding="utf-8"))
    if count != 1:
        raise SystemExit("配置格式不匹配，未修改文件。")
    text = text.replace("默认口令：KAMISATO。", "已设置自定义口令。")
    config.write_text(text, encoding="utf-8")
    print("已更新口令摘要。发布配置后生效；原会话会在刷新时失效。")


if __name__ == "__main__":
    main()
