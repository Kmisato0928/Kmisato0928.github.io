(() => {
  "use strict";

  const canvas = document.querySelector("#pixel-field");
  const context = canvas.getContext("2d", { alpha: false });
  const motionToggle = document.querySelector("#motion-toggle");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reducedMotion.matches;
  let width = 0;
  let height = 0;
  let particles = [];
  let animationId = null;
  let lastTimestamp = 0;
  let lastDraw = 0;
  let elapsed = 0;
  const pointer = { x: -1000, y: -1000 };

  function randomGenerator(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function resizeField() {
    if (!context) return;
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const random = randomGenerator(928);
    const step = width < 700 ? 10 : 12;
    particles = [];

    for (let y = -50; y < height + 50; y += step) {
      for (let x = -50; x < width + 50; x += step) {
        const u = x / width;
        const upperRibbon = height * (.10 + .25 * Math.sin(u * 4.4 - 1.4));
        const lowerRibbon = height * (.83 + .19 * Math.sin(u * 5.2 - .9));
        const spread = Math.max(55, height * .12);
        const upper = Math.exp(-(((y - upperRibbon) / spread) ** 2)) * (.15 + .85 * u);
        const lower = Math.exp(-(((y - lowerRibbon) / spread) ** 2)) * (1 - .65 * u);
        if (random() > Math.max(upper, lower) * .72 + .009) continue;
        particles.push({ x, y, size: 2 + random() * 3.7, phase: random() * Math.PI * 2, speed: .25 + random() * .6, opacity: .07 + random() * .23, green: random() < .2 });
      }
    }
    drawField();
  }

  function drawField() {
    if (!context) return;
    context.fillStyle = "#080b0b";
    context.fillRect(0, 0, width, height);
    const time = elapsed / 1000;
    for (const particle of particles) {
      let x = particle.x + Math.sin(time * .18 + particle.y / 190) * 16;
      let y = particle.y + Math.sin(time * .22 + particle.x / 260) * 21;
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      const influence = !paused && distance < 150 ? 1 - distance / 150 : 0;
      if (influence) {
        const force = influence * influence * 22 / Math.max(1, distance);
        x += dx * force;
        y += dy * force;
      }
      const breath = .68 + .32 * Math.sin(time * particle.speed + particle.phase);
      const opacity = Math.min(.6, particle.opacity * breath + influence * .2);
      context.fillStyle = particle.green ? `rgba(119,211,164,${opacity})` : `rgba(182,202,190,${opacity})`;
      context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size);
    }
  }

  function animate(timestamp) {
    animationId = null;
    if (paused || document.hidden || !context) return;
    if (lastTimestamp) elapsed += Math.min(timestamp - lastTimestamp, 100);
    lastTimestamp = timestamp;
    if (timestamp - lastDraw >= 1000 / 30) {
      drawField();
      lastDraw = timestamp;
    }
    animationId = requestAnimationFrame(animate);
  }

  function updateMotion() {
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    lastTimestamp = 0;
    motionToggle.setAttribute("aria-pressed", String(paused));
    const label = paused ? "播放背景动画" : "暂停背景动画";
    motionToggle.setAttribute("aria-label", label);
    motionToggle.title = label;
    if (!paused && !document.hidden && context) animationId = requestAnimationFrame(animate);
    else drawField();
  }

  motionToggle.addEventListener("click", () => { paused = !paused; updateMotion(); });
  reducedMotion.addEventListener("change", event => { paused = event.matches; updateMotion(); });
  document.addEventListener("visibilitychange", updateMotion);
  window.addEventListener("resize", resizeField, { passive: true });
  window.addEventListener("pointermove", event => { pointer.x = event.clientX; pointer.y = event.clientY; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.x = -1000; pointer.y = -1000; });
  resizeField();
  updateMotion();

  const form = document.querySelector("#access-form");
  const input = document.querySelector("#access-key");
  const field = document.querySelector(".key-field");
  const submit = document.querySelector(".enter-button");
  const message = document.querySelector("#form-message");
  const welcome = document.querySelector(".welcome-page");
  const workspace = document.querySelector("#workspace");
  const config = window.KAMISATO_CONFIG || {};
  const sessionKey = "kamisato.access";

  function showMessage(text) { message.textContent = text; }

  function setUnlocked(isUnlocked, focus = false) {
    welcome.hidden = isUnlocked;
    workspace.hidden = !isUnlocked;
    document.body.classList.toggle("workspace-open", isUnlocked);
    document.title = isUnlocked ? "KAMISATO — My Space" : "KAMISATO — Welcome";
    document.dispatchEvent(new CustomEvent("kamisato:access-change", { detail: { unlocked: isUnlocked } }));
    if (focus) document.querySelector(isUnlocked ? "#workspace-title" : "#access-key").focus();
  }

  // 只保留本标签页的解锁状态，不存储输入的明文口令。
  try {
    if (config.rememberForSession && config.accessKeyHash && sessionStorage.getItem(sessionKey) === config.accessKeyHash) setUnlocked(true);
  } catch { /* 禁用浏览器存储时仍可正常输入口令。 */ }

  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    field.removeAttribute("data-invalid");
    showMessage("");
  });

  document.querySelector("#lock-space").addEventListener("click", () => {
    try { sessionStorage.removeItem(sessionKey); } catch { /* 存储不可用。 */ }
    input.value = "";
    showMessage("");
    setUnlocked(false, true);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    if (!input.value.trim()) {
      input.setAttribute("aria-invalid", "true");
      field.dataset.invalid = "true";
      showMessage("请输入访问密钥。");
      input.focus();
      return;
    }
    form.setAttribute("aria-busy", "true");
    submit.disabled = true;
    input.readOnly = true;
    showMessage("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.value));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== config.accessKeyHash) {
        input.setAttribute("aria-invalid", "true");
        field.dataset.invalid = "true";
        showMessage("密钥不正确，请再试一次。");
        return;
      }
      if (config.rememberForSession) {
        try { sessionStorage.setItem(sessionKey, hash); } catch { /* 存储不可用。 */ }
      }
      input.value = "";
      setUnlocked(true, true);
    } catch {
      showMessage("暂时无法验证，请使用 HTTPS 或本地预览访问。");
    } finally {
      form.removeAttribute("aria-busy");
      submit.disabled = false;
      input.readOnly = false;
    }
  });
})();
