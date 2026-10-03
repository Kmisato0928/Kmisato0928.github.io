// 静态入口的公开配置。前端校验仅提供入口门槛，不是服务端权限控制。
window.KAMISATO_CONFIG = Object.freeze({
  // 默认口令：KAMISATO。运行 python3 tools/set_access_key.py 可以更换。
  accessKeyHash: "fc93e118f0d5fd88f72360563f79bc8e7d1ce3e5cc7c0a264f37a7e02c394756",
  rememberForSession: true,
});
