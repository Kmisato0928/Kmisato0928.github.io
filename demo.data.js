// 基于用户指定笔记整理的固定问答示例；不表示在线检索或模型生成。
window.KAMISATO_DEMO = {
  question: "ShadowBox 的 shadow 空间有哪些内存读写监控方案？请比较触发机制与覆盖边界，并说明实现状态。",
  title: "Shadow 空间的三条内存监控路径",
  summary: "笔记给出的三种方案是 API 监控、别名映射监控和线性映射区监控，分别覆盖显式函数调用、新建别名映射和直接访存。",
  clarification: "这里的“三种”指 shadow 空间建立后的内存读写监控方案，并不是三种空间创建模式。",
  status: "可行性论证 · 尚未实现",
  document: "shadow_box.md",
  section: "shadow空间内存读写监控逻辑",
  methods: [
    {
      title: "API 监控",
      mechanism: "Target 调用未映射的外部函数时触发 IABT。初始化时解析真实函数入口，异常时按 PC 匹配监控表，记录调用参数与读写方向。",
      examples: "__arch_copy_* · memcpy · memset",
      boundary: "覆盖函数形式的操作；直接 load/store 和完全内联的复制可能绕过 API 入口，需要数据访问异常补充监控。",
      source: "1. API监控",
      excerpt: "函数识别不应在缺页异常发生后再通过名称进行查找，而应采用“初始化阶段名称解析，运行时地址匹配”的方式。",
    },
    {
      title: "别名映射监控",
      mechanism: "捕获页面获取与映射 API，代理执行后校验“VA 不同、PFN 相同”。不将新别名同步到 Shadow 页表，后续访问通过 DABT 捕获。",
      examples: "pin_user_pages* · vmap · memremap",
      boundary: "同 PFN 只证明存在别名，需结合权限与页面归属判断风险。永久补映射只能捕获首次访问，持续监控需逐次恢复陷阱。",
      source: "2. 别名映射监控",
      excerpt: "如果虚拟地址不同而 PFN 相同，就确认建立了别名映射。由于内核自身也存在正常的 direct map 和 vmalloc 别名，所以仅凭相同 PFN 不能判定为异常。",
    },
    {
      title: "线性映射区监控",
      mechanism: "按“用户 VA → PFN → 线性映射 VA”建立索引，仅将 Shadow 中对应 PTE 置无效。DABT 命中后临时放行一条指令，再恢复陷阱。",
      examples: "Shadow PTE · DABT · 单步放行",
      boundary: "第一版仅纳入普通匿名私有驻留页；缺页/COW 后补入新 PFN，映射失效时移除。监控命中必须优先于通用 COW 补页。",
      source: "3. 内存线性映射区的监控",
      excerpt: "现有 sb_hook.c 中，Shadow 内翻译类 DABT 会交给 COW 补页。游戏页命中必须优先于 COW，否则 COW 会恢复原线性映射 PTE，使监控失效。",
    },
  ],
  takeaway: "三条路径互相补充。持续监控的关键是：记录访问后只临时放行，并及时恢复 Shadow 陷阱；不能把一次缺页捕获等同于持续监控。",
  glossary: "IABT：取指异常　·　DABT：数据访问异常　·　PFN：物理页帧号",
  statusEvidence: "三种途径现在还没有实现，我们先做可行性的研究论证。",
};
