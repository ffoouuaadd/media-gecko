(() => {
  const desktop = window.desktop;
  const panel = document.getElementById("assistant-panel");
  const setup = document.getElementById("assistant-setup");
  const chat = document.getElementById("assistant-chat");
  const messagesElement = document.getElementById("assistant-messages");
  const input = document.getElementById("assistant-input");
  const statusElement = document.getElementById("assistant-status");
  const history = [];
  let busy = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
  }

  function setConnected(status) {
    const connected = Boolean(status?.connected);
    setup.hidden = connected;
    chat.hidden = !connected;
    statusElement.textContent = connected ? `${status.model || "OpenAI"} · connected` : "Connect OpenAI API";
  }

  function addMessage(role, content, actions = []) {
    const article = document.createElement("article");
    article.className = `assistant-message ${role}`;
    article.innerHTML = `<b>${role === "assistant" ? "GECKO" : "YOU"}</b><p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>${actions.length ? `<div class="assistant-actions">${actions.map((action, index) => `<button data-assistant-action="${index}" data-kind="${escapeHtml(action.kind)}" data-query="${escapeHtml(action.query)}">${action.kind.toUpperCase()} · ${escapeHtml(action.query)}</button>`).join("")}</div>` : ""}`;
    messagesElement.append(article);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function runAssetSearch(kind, query) {
    const map = { image: "pngsources", sfx: "online", video: "youtube", local: "library" };
    const button = document.querySelector(`.nav[data-view="${map[kind] || "search"}"]`);
    button?.click();
    const search = document.getElementById("query");
    search.value = query;
    document.getElementById("search-form")?.requestSubmit();
    panel.hidden = true;
  }

  async function currentProject() {
    try {
      const projects = await desktop.listProjects(false);
      return projects?.[0] ? { name: projects[0].name, notes: projects[0].notes || "" } : null;
    } catch { return null; }
  }

  async function refreshStatus() {
    try { setConnected(await desktop.assistantStatus()); }
    catch { setConnected({ connected: false }); }
  }

  document.getElementById("assistant-toggle").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { refreshStatus(); setTimeout(() => (chat.hidden ? document.getElementById("assistant-key") : input).focus(), 20); }
  });
  document.getElementById("assistant-close").addEventListener("click", () => { panel.hidden = true; });
  document.getElementById("assistant-connect").addEventListener("click", async () => {
    const field = document.getElementById("assistant-key");
    const key = field.value.trim();
    if (!key) return field.focus();
    const button = document.getElementById("assistant-connect");
    button.disabled = true; button.textContent = "CONNECTING…";
    try { setConnected(await desktop.saveAssistantKey(key)); field.value = ""; }
    catch (error) { statusElement.textContent = error.message; }
    finally { button.disabled = false; button.textContent = "CONNECT"; }
  });
  document.getElementById("assistant-disconnect").addEventListener("click", async () => {
    setConnected(await desktop.saveAssistantKey(""));
    history.length = 0;
  });
  messagesElement.addEventListener("click", event => {
    const button = event.target.closest("[data-assistant-action]");
    if (button) runAssetSearch(button.dataset.kind, button.dataset.query);
  });
  document.getElementById("assistant-form").addEventListener("submit", async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    history.push({ role: "user", content: text });
    addMessage("user", text);
    input.value = ""; busy = true;
    const send = event.currentTarget.querySelector("button");
    send.disabled = true; send.textContent = "THINKING…";
    try {
      const result = await desktop.assistantChat(history, await currentProject());
      history.push({ role: "assistant", content: result.text });
      addMessage("assistant", result.text, result.actions || []);
    } catch (error) {
      addMessage("assistant", `Error: ${error.message}`);
    } finally {
      busy = false; send.disabled = false; send.textContent = "SEND"; input.focus();
    }
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); document.getElementById("assistant-form").requestSubmit(); }
  });
  refreshStatus();
})();
