(() => {
  const modal = document.getElementById("onboarding");
  const options = document.getElementById("feature-options");
  const setupKey = "media-gecko-workspace-setup-v2";
  let page = 0;

  function allFeatures() {
    return navLayout.map(item => {
      const button = document.querySelector(`.nav[data-nav-key="${CSS.escape(item.key)}"]`);
      return { key:item.key, label:button?.querySelector("span")?.textContent || item.key, selected:true };
    });
  }
  let features = allFeatures();
  function renderFeatures() {
    options.innerHTML = features.map(item => `<button class="${item.selected ? "active" : ""}" data-feature="${escapeHtml(item.key)}"><i></i><span>${escapeHtml(item.label)}</span></button>`).join("");
  }
  function showPage(next) {
    page = Math.max(0, Math.min(2, next));
    document.querySelectorAll("[data-onboarding-page]").forEach((element, index) => { element.hidden = index !== page; });
    document.getElementById("onboarding-step").textContent = `${page + 1} / 3`;
    document.getElementById("onboarding-back").hidden = page === 0;
    document.getElementById("onboarding-next").textContent = page === 0 ? "CHOOSE FEATURES" : page === 1 ? "CONTINUE" : "START USING MEDIA GECKO";
  }
  function finish(showEverything = false) {
    if (showEverything) features.forEach(item => item.selected = true);
    const selected = new Set(features.filter(item => item.selected).map(item => item.key));
    navLayout.forEach(item => { item.hidden = !selected.has(item.key); });
    const settingsItem = navLayout.find(item => item.key === "settings:");
    if (settingsItem) settingsItem.hidden = false;
    saveLayouts(); applyNavLayout();
    localStorage.setItem(setupKey, JSON.stringify({ visible:[...selected], completedAt:Date.now() }));
    localStorage.removeItem("media-gecko-onboarding");
    modal.hidden = true;
    showMessage(showEverything ? "All Media Gecko features enabled." : "Workspace saved. Restore any tab from Settings.");
  }
  function open() {
    features = allFeatures();
    features.forEach(feature => { feature.selected = !navLayout.find(item => item.key === feature.key)?.hidden; });
    if (!features.some(item => item.selected)) features.forEach(item => item.selected = true);
    renderFeatures(); modal.hidden = false; showPage(0);
  }

  options.addEventListener("click", event => {
    const button = event.target.closest("[data-feature]"); if (!button) return;
    const item = features.find(value => value.key === button.dataset.feature); if (!item) return;
    item.selected = !item.selected; button.classList.toggle("active", item.selected);
  });
  document.getElementById("onboarding-next").addEventListener("click", () => { if (page < 2) showPage(page + 1); else finish(false); });
  document.getElementById("onboarding-back").addEventListener("click", () => showPage(page - 1));
  document.getElementById("onboarding-skip").addEventListener("click", () => finish(true));
  document.getElementById("rerun-onboarding").addEventListener("click", open);
  document.getElementById("customize-workspace").addEventListener("click", () => { selectView("settings"); const block=document.getElementById("workspace-settings"); block.open=true; setTimeout(()=>block.scrollIntoView({behavior:"smooth",block:"start"}),50); });
  if (!localStorage.getItem(setupKey)) open();
  window.mediaGeckoOnboarding = { open };
})();
