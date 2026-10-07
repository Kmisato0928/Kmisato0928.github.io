(() => {
  "use strict";

  const workspace = document.querySelector("#workspace");
  const resumeView = document.querySelector("#resume-view");
  const chatView = document.querySelector("#chat-view");
  const title = document.querySelector("#workspace-title");
  const resumeContent = document.querySelector("#resume-content");
  const resume = window.KAMISATO_RESUME;
  const ragDemo = window.KAMISATO_DEMO;
  const mobile = window.matchMedia("(max-width: 760px)");
  const panel = document.querySelector("#connection-panel");
  const panelToggle = document.querySelector("#connection-toggle");
  const panelClose = document.querySelector("#connection-close");
  const backdrop = document.querySelector("#connection-backdrop");
  const questionForm = document.querySelector("#question-form");
  const questionInput = document.querySelector("#question-input");
  const sendButton = document.querySelector("#question-send");
  const conversation = document.querySelector("#conversation");
  const conversationScroll = document.querySelector("#conversation-scroll");
  const emptyChat = document.querySelector("#chat-empty");
  const demoQuestion = document.querySelector("#rag-demo-question");
  const serviceUrl = document.querySelector("#service-url");
  const serviceKey = document.querySelector("#service-key");
  const keyToggle = document.querySelector("#service-key-toggle");
  const connectionMessage = document.querySelector("#connection-message");
  const toast = document.querySelector("#workspace-toast");
  let currentView = "resume";
  let currentSection = "overview";
  let panelOpen = !mobile.matches;
  let desktopPanelOpen = panelOpen;
  let connectionMode = "demo";
  let pendingReply = null;
  let toastTimer = null;
  let messageSequence = 0;

  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", "ws-icon");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#icon-" + name);
    svg.append(use);
    return svg;
  }

  function tags(items) {
    const list = element("div", "tag-list");
    items.forEach(text => list.append(element("span", "resume-tag", text)));
    return list;
  }

  const sections = {
    overview: { title: "个人简介" },
    skills: { title: "个人技能" },
    projects: { title: "项目开发" },
    education: { title: "教育经历" },
  };

  function renderResume(section) {
    if (!sections[section]) return;
    currentSection = section;
    document.querySelectorAll(".resume-categories [data-resume-section]").forEach(button => {
      const active = button.dataset.resumeSection === section;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const info = sections[section];
    const documentBody = element("div", "resume-document");
    const heading = element("header", "resume-section-head");
    heading.append(element("h2", "", info.title));
    documentBody.append(heading);

    if (section === "overview") {
      const hero = element("div", "profile-hero");
      hero.append(element("h3", "profile-name", resume.displayName), element("p", "profile-focus", resume.focus), element("p", "profile-summary", resume.summary));
      const facts = element("dl", "profile-facts");
      resume.facts.forEach(({ label, value }) => {
        const fact = element("div");
        fact.append(element("dt", "", label), element("dd", "", value));
        facts.append(fact);
      });
      documentBody.append(hero, facts);
    } else if (section === "skills") {
      resume.skillGroups.forEach((group, index) => {
        const block = element("section", "skill-block");
        const row = element("div", "section-row");
        row.append(element("h3", "", group.title), element("span", "section-number", "0" + (index + 1)));
        block.append(row);
        if (group.description) block.append(element("p", "", group.description));
        block.append(tags(group.items));
        documentBody.append(block);
      });
    } else if (section === "projects") {
      let category = null;
      let group = null;
      resume.projects.forEach(project => {
        if (category !== project.category) {
          category = project.category;
          group = element("section", "project-group");
          group.append(element("h3", "project-group-title", category));
          documentBody.append(group);
        }
        const block = element("section", "project-block");
        const row = element("div", "section-row");
        row.append(element("h4", "", project.name), element("span", "section-date", project.period));
        const highlights = element("ul", "project-highlights");
        project.highlights.forEach(text => highlights.append(element("li", "", text)));
        block.append(row, element("p", "project-role", project.role), element("p", "", project.description), tags(project.technologies));
        if (project.highlights.length) block.append(highlights);
        group.append(block);
      });
    } else if (section === "education") {
      const list = element("div", "education-list");
      resume.education.forEach(education => {
        const item = element("section", "education-item");
        item.append(element("span", "section-date", education.period), element("h3", "", education.school), element("div", "education-degree", education.degree), element("p", "", education.description));
        list.append(item);
      });
      documentBody.append(list);
    }
    resumeContent.replaceChildren(documentBody);
    resumeContent.scrollTop = 0;
  }

  function renderPanel() {
    const isDrawer = mobile.matches && panelOpen && currentView === "chat" && !workspace.hidden;
    panel.hidden = !panelOpen;
    panelToggle.setAttribute("aria-expanded", String(panelOpen));
    backdrop.hidden = !isDrawer;
    panel.setAttribute("role", isDrawer ? "dialog" : "complementary");
    if (isDrawer) panel.setAttribute("aria-modal", "true");
    else panel.removeAttribute("aria-modal");
    document.querySelector("#workspace-rail").inert = isDrawer;
    document.querySelector("#workspace-header").inert = isDrawer;
    document.querySelector("#chat-main").inert = isDrawer;
  }

  function setPanel(open, focus = true) {
    panelOpen = open;
    if (!mobile.matches) desktopPanelOpen = open;
    renderPanel();
    if (focus && mobile.matches) {
      if (open) panelClose.focus();
      else panelToggle.focus();
    } else if (!open && panel.contains(document.activeElement)) panelToggle.focus();
  }

  function setView(view, focus = true) {
    if (!["resume", "chat"].includes(view)) return;
    currentView = view;
    resumeView.hidden = view !== "resume";
    chatView.hidden = view !== "chat";
    document.querySelector("#chat-actions").hidden = view !== "chat";
    title.textContent = view === "resume" ? "个人简历" : "问答工作台";
    if (!workspace.hidden) document.title = "KAMISATO — " + title.textContent;
    document.querySelectorAll("[data-workspace-view]").forEach(button => {
      const active = button.dataset.workspaceView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (mobile.matches) panelOpen = false;
    renderPanel();
    if (focus) title.focus();
  }

  workspace.addEventListener("click", event => {
    const viewButton = event.target.closest("[data-workspace-view]");
    if (viewButton) setView(viewButton.dataset.workspaceView);
    const sectionButton = event.target.closest("[data-resume-section]");
    if (sectionButton) {
      renderResume(sectionButton.dataset.resumeSection);
      // 右侧内容中的快捷入口会被重新渲染，保持键盘焦点可见。
      if (!sectionButton.isConnected) resumeContent.focus();
    }
  });

  panelToggle.addEventListener("click", () => setPanel(!panelOpen));
  panelClose.addEventListener("click", () => setPanel(false));
  backdrop.addEventListener("click", () => setPanel(false));
  mobile.addEventListener("change", () => {
    const hadPanelFocus = panel.contains(document.activeElement);
    panelOpen = mobile.matches ? false : desktopPanelOpen;
    renderPanel();
    if (hadPanelFocus && !panelOpen) panelToggle.focus();
  });
  workspace.addEventListener("keydown", event => {
    if (event.key === "Escape" && currentView === "chat" && panelOpen) {
      event.preventDefault();
      setPanel(false);
    }
    if (event.key !== "Tab" || !mobile.matches || !panelOpen || currentView !== "chat") return;
    const focusable = Array.from(panel.querySelectorAll("button, input")).filter(item => !item.disabled && (item.type !== "radio" || item.checked));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function notify(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function updateSendButton() {
    const busy = Boolean(pendingReply);
    sendButton.disabled = !busy && (connectionMode !== "demo" || !questionInput.value.trim());
    sendButton.dataset.busy = String(busy);
    sendButton.setAttribute("aria-label", busy ? "停止生成回答" : "发送问题");
    questionForm.setAttribute("aria-busy", String(busy));
  }

  function sizeComposer() {
    questionInput.style.height = "auto";
    questionInput.style.height = Math.min(questionInput.scrollHeight, mobile.matches ? 120 : 180) + "px";
  }

  function scrollConversation() { conversationScroll.scrollTop = conversationScroll.scrollHeight; }

  function stopReply(markStopped = true) {
    if (!pendingReply) return;
    clearTimeout(pendingReply.timer);
    if (markStopped) {
      pendingReply.article.classList.remove("is-pending");
      pendingReply.content.textContent = "已停止生成。";
    }
    pendingReply = null;
    conversation.setAttribute("aria-busy", "false");
    updateSendButton();
  }

  function updateMode() {
    stopReply();
    const remote = connectionMode === "remote";
    const status = document.querySelector("#connection-status");
    status.dataset.mode = connectionMode;
    status.lastElementChild.textContent = remote ? "未连接" : "笔记问答";
    const mode = document.querySelector("#composer-mode");
    mode.dataset.mode = connectionMode;
    mode.replaceChildren(element("span", "status-dot"), document.createTextNode(remote ? "远程 Mac · 未连接" : "项目笔记"));
    questionInput.disabled = remote;
    demoQuestion.hidden = remote || !ragDemo;
    questionInput.placeholder = remote ? "远程服务未连接，请切换笔记问答。" : "输入你的问题…";
    document.querySelector("#chat-notice").textContent = remote ? "远程服务未连接。" : "";
    updateSendButton();
  }

  document.querySelectorAll('[name="connection-mode"]').forEach(input => input.addEventListener("change", () => {
    connectionMode = input.value;
    connectionMessage.textContent = "";
    updateMode();
  }));
  document.querySelector("#connection-form").addEventListener("submit", event => {
    event.preventDefault();
    const address = serviceUrl.value.trim();
    if (connectionMode === "remote" && !address) {
      connectionMessage.textContent = "请填写服务地址。";
      serviceUrl.focus();
      return;
    }
    if (address) {
      try {
        const url = new URL(address);
        const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) throw new Error("Invalid service URL");
      } catch {
        connectionMessage.textContent = "请使用 HTTPS 服务地址；本地测试可填写 http://localhost:端口。";
        serviceUrl.focus();
        return;
      }
    }
    serviceUrl.value = address;
    // 当前仅搭建前端。配置留在表单内存中，不持久化、不发送网络请求。
    connectionMessage.textContent = connectionMode === "remote" ? "配置已保存，尚未建立远程连接。" : "已选择笔记问答。";
    notify("配置已保存到当前页面");
  });
  keyToggle.addEventListener("click", () => {
    const reveal = serviceKey.type === "password";
    serviceKey.type = reveal ? "text" : "password";
    keyToggle.textContent = reveal ? "隐藏" : "显示";
    keyToggle.setAttribute("aria-label", reveal ? "隐藏访问密钥" : "显示访问密钥");
    keyToggle.setAttribute("aria-pressed", String(reveal));
  });

  function addMessage(role, text) {
    const article = element("article", "chat-message is-" + role);
    article.id = "chat-message-" + (++messageSequence);
    const heading = element("div", "message-heading");
    if (role === "assistant") heading.append(element("span", "message-avatar", "K"));
    heading.append(element("span", "message-label", role === "user" ? "你" : "KAMISATO"));
    if (role === "assistant") heading.append(element("span", "message-badge", ""));
    const content = element("div", "message-content", text);
    article.append(heading, content);
    conversation.append(article);
    emptyChat.hidden = true;
    return { article, content };
  }

  function addCopyButton(article, content, copyText = content.textContent) {
    const footer = element("div", "message-footer");
    const button = element("button", "message-copy");
    const label = element("span", "", "复制回答");
    button.type = "button";
    button.append(icon("copy"), label);
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyText);
        label.textContent = "已复制";
        setTimeout(() => { if (button.isConnected) label.textContent = "复制回答"; }, 2000);
      } catch { notify("无法复制，请选中回答文字复制。"); }
    });
    footer.append(button);
    article.append(footer);
  }

  function isRagDemoQuestion(question) {
    return Boolean(ragDemo) && /shadow[\s_-]*box|shadow\s*空间/i.test(question) && /三种|三条|监控|方案|模式|创建/.test(question);
  }

  function renderRagDemo(reply, question) {
    const content = reply.content;
    const corrected = /创建/.test(question);
    content.classList.add("rag-answer");
    content.replaceChildren();
    reply.article.querySelector(".message-badge").textContent = "笔记问答";

    const provenance = element("div", "rag-provenance");
    provenance.append(element("span", "rag-provenance-label", "基于项目笔记"), element("span", "rag-status", ragDemo.status));
    content.append(provenance, element("h2", "rag-title", ragDemo.title));
    if (corrected) content.append(element("p", "rag-clarification", ragDemo.clarification));
    content.append(element("p", "rag-summary", ragDemo.summary));

    const sources = element("details", "rag-sources");
    sources.append(element("summary", "", ragDemo.document + " › " + ragDemo.section + " · 3 个出处"));
    const sourceList = element("ol", "rag-source-list");
    sources.append(sourceList);
    const table = element("table", "rag-comparison");
    table.setAttribute("aria-label", "三种内存监控方案的机制与覆盖边界对比");
    const head = element("thead");
    const headings = element("tr");
    ["监控方案", "触发机制", "覆盖边界"].forEach(text => {
      const heading = element("th", "", text);
      heading.scope = "col";
      headings.append(heading);
    });
    head.append(headings);
    const body = element("tbody");
    table.append(head, body);

    ragDemo.methods.forEach((method, index) => {
      const number = index + 1;
      const source = element("li", "rag-source-item");
      source.id = reply.article.id + "-source-" + number;
      source.append(element("h3", "", method.source), element("p", "", method.excerpt));
      sourceList.append(source);

      const row = element("tr");
      const name = element("th", "rag-method");
      name.scope = "row";
      const reference = element("button", "rag-citation", "[" + number + "]");
      reference.type = "button";
      reference.setAttribute("aria-label", "查看笔记出处：" + method.source);
      reference.setAttribute("aria-controls", source.id);
      reference.addEventListener("click", () => {
        sources.open = true;
        source.scrollIntoView({ block: "nearest" });
      });
      name.append(element("span", "rag-method-name", method.title), reference);
      const mechanism = element("td", "rag-mechanism");
      mechanism.dataset.label = "触发机制";
      mechanism.append(element("p", "", method.mechanism), element("p", "rag-code", method.examples));
      const boundary = element("td", "rag-boundary", method.boundary);
      boundary.dataset.label = "覆盖边界";
      row.append(name, mechanism, boundary);
      body.append(row);
    });

    content.append(table, element("p", "rag-takeaway", ragDemo.takeaway), element("p", "rag-glossary", ragDemo.glossary), sources);
    sources.append(element("p", "rag-source-status", "章节状态原文：“" + ragDemo.statusEvidence + "”"));

    // 单独提供有段落分隔的复制文本，避免表格 DOM 的 textContent 连成一串。
    const copyText = [
      ragDemo.title,
      ...(corrected ? [ragDemo.clarification] : []),
      ragDemo.summary,
      "实现状态：" + ragDemo.status,
      ...ragDemo.methods.map((method, index) => [
        (index + 1) + ". " + method.title + " [" + (index + 1) + "]",
        "触发机制：" + method.mechanism,
        "示例：" + method.examples,
        "覆盖边界：" + method.boundary,
      ].join("\n")),
      ragDemo.takeaway,
      ragDemo.glossary,
      "来源：" + ragDemo.document + " › " + ragDemo.section,
      ...ragDemo.methods.map((method, index) => "[" + (index + 1) + "] " + method.source + "\n" + method.excerpt),
      "章节状态原文：“" + ragDemo.statusEvidence + "”",
    ].join("\n\n");
    addCopyButton(reply.article, content, copyText);
  }

  function demoAnswer(question) {
    if (/项目|复盘/.test(question)) return "可以按下面五个部分整理项目复盘：\n\n01  背景与目标\n为什么做这个项目？希望解决什么问题？\n\n02  方案与取舍\n采用了什么技术方案？为什么这样选择？\n\n03  你的贡献\n你具体负责什么？解决了哪些关键问题？\n\n04  结果与证据\n展示实际效果，并补充可验证的数据或作品。\n\n05  收获与改进\n哪些方法值得保留？下一次会怎样做得更好？";
    if (/工作台|介绍|功能/.test(question)) return "这是你的个人问答工作台。\n\n在中间输入问题，回答会显示在当前对话中。支持停止生成、复制回答与新建对话；笔记问答可以展开引用，查看对应的项目笔记内容。\n\n左侧连接配置可以收起，手机上默认隐藏。";
    return "当前笔记问答收录了 ShadowBox 内存读写监控的专题内容。\n\n可以提问：ShadowBox 的 shadow 空间有哪些内存读写监控方案？请比较触发机制与覆盖边界，并说明实现状态。";
  }

  function sendQuestion() {
    if (connectionMode !== "demo" || pendingReply) return;
    const question = questionInput.value.trim();
    if (!question) return;
    addMessage("user", question);
    questionInput.value = "";
    sizeComposer();
    const isRagDemo = isRagDemoQuestion(question);
    const reply = addMessage("assistant", "正在整理回答…");
    reply.article.classList.add("is-pending");
    conversation.setAttribute("aria-busy", "true");
    const job = { article: reply.article, content: reply.content, timer: null };
    pendingReply = job;
    job.timer = setTimeout(() => {
      if (pendingReply !== job) return;
      reply.article.classList.remove("is-pending");
      if (isRagDemo) renderRagDemo(reply, question);
      else {
        reply.content.textContent = demoAnswer(question);
        addCopyButton(reply.article, reply.content);
      }
      pendingReply = null;
      conversation.setAttribute("aria-busy", "false");
      updateSendButton();
      // 笔记回答较长，完成后保留问题和回答开头，便于阅读与截图。
      if (isRagDemo) reply.article.previousElementSibling.scrollIntoView({ block: "start" });
      else scrollConversation();
    }, 1100);
    updateSendButton();
    scrollConversation();
    questionInput.focus();
  }

  demoQuestion.addEventListener("click", () => {
    if (connectionMode !== "demo" || pendingReply || !ragDemo) return;
    questionInput.value = ragDemo.question;
    sizeComposer();
    updateSendButton();
    questionInput.focus();
  });

  questionForm.addEventListener("submit", event => {
    event.preventDefault();
    if (pendingReply) stopReply();
    else sendQuestion();
  });
  questionInput.addEventListener("input", () => { sizeComposer(); updateSendButton(); });
  questionInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      event.preventDefault();
      if (!pendingReply) sendQuestion();
    }
  });
  document.querySelector("#new-conversation").addEventListener("click", () => {
    stopReply(false);
    conversation.replaceChildren();
    emptyChat.hidden = false;
    questionInput.value = "";
    sizeComposer();
    updateSendButton();
    if (connectionMode === "demo") questionInput.focus();
  });

  const originalMotion = document.querySelector("#motion-toggle");
  const workspaceMotion = document.querySelector("#workspace-motion");
  function syncMotion() {
    workspaceMotion.setAttribute("aria-pressed", originalMotion.getAttribute("aria-pressed"));
    workspaceMotion.setAttribute("aria-label", originalMotion.getAttribute("aria-label"));
    workspaceMotion.title = originalMotion.title;
  }
  workspaceMotion.addEventListener("click", () => { originalMotion.click(); syncMotion(); });
  new MutationObserver(syncMotion).observe(originalMotion, { attributes: true, attributeFilter: ["aria-pressed", "aria-label"] });

  document.addEventListener("kamisato:access-change", event => {
    if (event.detail.unlocked) setView("resume", false);
    else {
      stopReply();
      serviceKey.value = "";
      serviceKey.type = "password";
      keyToggle.textContent = "显示";
      keyToggle.setAttribute("aria-label", "显示访问密钥");
      keyToggle.setAttribute("aria-pressed", "false");
      clearTimeout(toastTimer);
      toast.hidden = true;
      renderPanel();
    }
  });

  renderResume(currentSection);
  setView(currentView, false);
  updateMode();
  syncMotion();
})();
