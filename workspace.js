import { normalizeServiceUrl, connectService, askService } from "./chat-client.js";
import { renderMarkdown } from "./markdown.js";

(() => {
  "use strict";

  const workspace = document.querySelector("#workspace");
  const resumeView = document.querySelector("#resume-view");
  const chatView = document.querySelector("#chat-view");
  const title = document.querySelector("#workspace-title");
  const resumeContent = document.querySelector("#resume-content");
  const resume = window.KAMISATO_RESUME;
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
  const sampleQuestion = document.querySelector("#sample-question");
  const serviceUrl = document.querySelector("#service-url");
  const serviceKey = document.querySelector("#service-key");
  const keyToggle = document.querySelector("#service-key-toggle");
  const connectionMessage = document.querySelector("#connection-message");
  const connectionSave = document.querySelector("#connection-save");
  const toast = document.querySelector("#workspace-toast");
  let currentView = "resume";
  let currentSection = "overview";
  let panelOpen = !mobile.matches;
  let desktopPanelOpen = panelOpen;
  let connection = null;
  let connectionController = null;
  let sessionId = null;
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
    sendButton.disabled = !busy && (!connection || !questionInput.value.trim());
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
    pendingReply.controller.abort();
    pendingReply.article.classList.remove("is-pending");
    if (markStopped) {
      renderReply(pendingReply);
      pendingReply.article.append(element("p", "message-note", "已停止生成。"));
    }
    pendingReply = null;
    conversation.setAttribute("aria-busy", "false");
    updateSendButton();
  }

  function updateConnection(state = connection ? "connected" : "offline") {
    const status = document.querySelector("#connection-status");
    status.dataset.state = state;
    status.lastElementChild.textContent = connection ? connection.title + " · 已连接" : (state === "connecting" ? "正在连接…" : state === "error" ? "连接失败" : "未连接");
    const mode = document.querySelector("#composer-mode");
    mode.dataset.state = state;
    mode.replaceChildren(element("span", "status-dot"), document.createTextNode(connection ? connection.title : "知识库未连接"));
    questionInput.disabled = !connection;
    questionInput.placeholder = connection ? "根据你的笔记提问…" : "请先连接知识库…";
    document.querySelector("#chat-notice").textContent = connection ? "" : "打开连接配置，连接 Linux 上的笔记知识库。";
    updateSendButton();
  }

  function disconnect() {
    connectionController?.abort();
    connectionController = null;
    stopReply();
    connection = null;
    sessionId = null;
    connectionSave.disabled = false;
    connectionMessage.textContent = "";
    updateConnection();
  }
  serviceUrl.addEventListener("input", disconnect);
  serviceKey.addEventListener("input", disconnect);
  document.querySelector("#connection-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!serviceUrl.value.trim()) {
      connectionMessage.textContent = "请填写服务地址。";
      serviceUrl.focus();
      return;
    }
    if (!serviceKey.value.trim()) {
      connectionMessage.textContent = "请填写网站服务访问密钥。";
      serviceKey.focus();
      return;
    }
    disconnect();
    const controller = new AbortController();
    connectionController = controller;
    connectionSave.disabled = true;
    updateConnection("connecting");
    connectionMessage.textContent = "正在验证 Linux 服务和知识库连接…";
    try {
      const address = normalizeServiceUrl(serviceUrl.value);
      const key = serviceKey.value.trim();
      const info = await connectService(address, key, AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]));
      if (connectionController !== controller) return;
      connection = { address, key, title: info.title };
      serviceUrl.value = address;
      connectionMessage.textContent = "已连接 " + info.title + "，可以开始提问。";
      updateConnection();
      notify("知识库连接成功");
      if (mobile.matches) setPanel(false);
    } catch (error) {
      if (connectionController !== controller) return;
      connectionMessage.textContent = error.name === "TypeError" ? "无法访问服务，请检查服务地址、Linux 服务状态及跨域配置。" : error.name === "TimeoutError" ? "连接超时，请确认 Linux 服务正在运行。" : error.message;
      updateConnection("error");
    } finally {
      if (connectionController === controller) {
        connectionController = null;
        connectionSave.disabled = false;
      }
    }
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

  function renderReply(reply) {
    const sources = reply.sources || [];
    let sourceSection;
    const sourceItems = new Map();
    const revealCitation = index => {
      const item = sourceItems.get(index);
      if (!item) return notify("这条引用没有返回对应的笔记片段。");
      sourceSection.open = true;
      item.scrollIntoView({ block: "nearest" });
    };
    renderMarkdown(reply.content, reply.answer || "暂未获得回答。", revealCitation);
    if (!sources.length) return;
    sourceSection = element("details", "rag-sources");
    sourceSection.append(element("summary", "", "笔记出处 · " + sources.length + " 个片段"));
    const sourceList = element("ol", "rag-source-list");
    sources.forEach(source => {
      const item = element("li", "rag-source-item");
      item.value = source.index + 1;
      item.append(element("h3", "", source.document), element("p", "", source.content));
      sourceItems.set(source.index, item);
      sourceList.append(item);
    });
    sourceSection.append(sourceList);
    reply.content.append(sourceSection);
  }

  async function sendQuestion() {
    if (!connection || pendingReply) return;
    const question = questionInput.value.trim();
    if (!question) return;
    const currentConnection = connection;
    addMessage("user", question);
    questionInput.value = "";
    sizeComposer();
    const reply = addMessage("assistant", "正在检索笔记并生成回答…");
    reply.article.classList.add("is-pending");
    reply.article.querySelector(".message-badge").textContent = currentConnection.title;
    conversation.setAttribute("aria-busy", "true");
    const job = { ...reply, controller: new AbortController(), answer: "", sources: [] };
    pendingReply = job;
    updateSendButton();
    scrollConversation();
    questionInput.focus();
    try {
      await askService(currentConnection.address, currentConnection.key, question, sessionId,
        job.controller.signal, (event, data) => {
          if (pendingReply !== job) return;
          if (event === "session") sessionId = data.session_id;
          else if (event === "delta" || event === "answer") {
            job.answer = event === "answer" ? data.text : job.answer + data.text;
            job.content.textContent = job.answer;
            job.article.classList.remove("is-pending");
            scrollConversation();
          } else if (event === "sources") job.sources = data.sources;
        });
      if (pendingReply !== job) return;
      renderReply(job);
      addCopyButton(job.article, job.content, job.answer);
    } catch (error) {
      if (pendingReply !== job) return;
      renderReply(job);
      const message = error.name === "TypeError" ? "连接中断，请确认 Linux 问答服务仍在运行。" : error.message;
      job.article.append(element("p", "message-note", message));
      notify(message);
    } finally {
      if (pendingReply === job) {
        job.article.classList.remove("is-pending");
        pendingReply = null;
        conversation.setAttribute("aria-busy", "false");
        updateSendButton();
        scrollConversation();
      }
    }
  }

  sampleQuestion.addEventListener("click", () => {
    if (pendingReply) return;
    if (!connection) { setPanel(true); return serviceUrl.focus(); }
    questionInput.value = "ShadowBox 的 shadow 空间有哪些内存读写监控方案？请比较触发机制与覆盖边界，并说明实现状态。";
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
    sessionId = null;
    if (connection) questionInput.focus();
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
      disconnect();
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
  serviceUrl.value = window.KAMISATO_CONFIG?.chatServiceUrl ||
    (["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:8787" : "");
  updateConnection();
  syncMotion();
})();
