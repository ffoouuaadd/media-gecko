(() => {
  const grid = document.getElementById("native-sfx-grid");
  if (!grid || !window.desktop) return;
  const search = document.getElementById("native-search");
  const category = document.getElementById("native-category");
  const sort = document.getElementById("native-sort");
  const favoritesOnly = document.getElementById("native-favorites");
  const recentOnly = document.getElementById("native-recent");
  const context = document.getElementById("native-context");
  let offlineSounds = [];
  let remoteSounds = [];
  let contextSound = null;
  let searchTimer = null;
  let searchGeneration = 0;
  const favorites = new Set(JSON.parse(localStorage.getItem("media-gecko-native-favorites") || "[]"));
  const recent = new Map(JSON.parse(localStorage.getItem("media-gecko-native-recent") || "[]"));
  const warm = new Map();

  function persist() {
    localStorage.setItem("media-gecko-native-favorites", JSON.stringify([...favorites]));
    localStorage.setItem("media-gecko-native-recent", JSON.stringify([...recent]));
  }
  function allSounds() { return [...remoteSounds, ...offlineSounds]; }
  function soundTags(sound) { return Array.isArray(sound.tags) ? sound.tags : []; }
  function card(sound) {
    const favorite = favorites.has(sound.id);
    const ready = Boolean(sound.assetId);
    const remote = sound.source === "MyInstants";
    return `<article class="native-sfx-card ${ready ? "draggable drag-ready" : "remote-native"}" ${ready ? 'draggable="true"' : ''} data-asset-id="${ready ? escapeHtml(sound.assetId) : ''}" data-native-id="${escapeHtml(sound.id)}">
      <button class="native-main" data-native-play="${escapeHtml(sound.id)}" title="Play ${escapeHtml(sound.name || sound.title)}"><span class="sfx-puck"><i class="sfx-wave"><b></b><b></b><b></b><b></b><b></b></i></span><b>${escapeHtml(sound.name || sound.title)}</b><small>${escapeHtml(sound.category || "Comedy / Meme")} ${sound.duration ? `· ${time(sound.duration)}` : ""}</small><i class="pixel-led"></i></button>
      <div class="native-card-foot"><span>${soundTags(sound).slice(0, 2).map(tag => `#${escapeHtml(tag)}`).join(" ")}</span><button data-native-favorite="${escapeHtml(sound.id)}" class="${favorite ? "active" : ""}" title="Favorite">★</button>${remote ? `<button class="native-save ${ready ? "ready" : ""}" data-native-save="${escapeHtml(sound.id)}" title="Cache as a draggable local MP3">${sound.loading ? "…" : ready ? "DRAG" : "SAVE"}</button><mark>MYINSTANTS</mark>` : '<mark title="Installed offline">LOCAL</mark>'}</div>
    </article>`;
  }
  function refreshCategories() {
    const selected = category.value;
    const categories = [...new Set(allSounds().map(sound => sound.category).filter(Boolean))].sort();
    category.innerHTML = '<option value="">All categories</option>' + categories.map(value => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }
  function filtered() {
    const term = search.value.trim().toLowerCase();
    const chosen = category.value;
    let values = allSounds().filter(sound => (!term || `${sound.name || sound.title} ${sound.category || ""} ${soundTags(sound).join(" ")}`.toLowerCase().includes(term)) && (!chosen || sound.category === chosen) && (!favoritesOnly.checked || favorites.has(sound.id)) && (!recentOnly.checked || recent.has(sound.id)));
    if (sort.value === "name") values.sort((a, b) => (a.name || a.title).localeCompare(b.name || b.title));
    else if (sort.value === "recent") values.sort((a, b) => (recent.get(b.id) || 0) - (recent.get(a.id) || 0));
    else values.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return values;
  }
  function render() {
    const values = filtered();
    grid.innerHTML = values.map(card).join("") || '<div class="no-assets">No matching sounds.</div>';
    const online = values.filter(sound => sound.source === "MyInstants").length;
    document.getElementById("result-count").textContent = `${values.length} SFX · ${online} MyInstants · ${values.length - online} offline`;
  }
  async function prepare(sound, silent = false) {
    if (!sound || sound.source !== "MyInstants" || sound.assetId || sound.loading) return sound?.assetId;
    sound.loading = true; render();
    try {
      const asset = await window.desktop.cacheMyInstant({ url: sound.url, title: sound.name || sound.title });
      sound.assetId = asset.id;
      if (!silent) showMessage("MyInstant cached. Drag the pixel button into your editor.");
      await loadLibrary();
      return asset.id;
    } catch (error) {
      if (!silent) showMessage(error.message);
      return null;
    } finally { sound.loading = false; render(); }
  }
  function play(sound) {
    if (!sound) return;
    recent.set(sound.id, Date.now()); persist();
    playPreview(sound.previewUrl, sound.name || sound.title, sound.source === "MyInstants" ? "MyInstants · caching locally" : `${sound.category} · Native SFX`);
    if (sound.source === "MyInstants") prepare(sound, true);
    const item = grid.querySelector(`[data-native-id="${CSS.escape(sound.id)}"]`);
    item?.classList.remove("playing"); requestAnimationFrame(() => item?.classList.add("playing"));
  }
  async function searchMyInstants(term = "") {
    const generation = ++searchGeneration;
    document.querySelector("#native-section .native-notice span").textContent = "Loading MyInstants sound buttons…";
    try {
      const found = await window.desktop.searchMyInstants(term);
      if (generation !== searchGeneration) return;
      remoteSounds = found.map(sound => ({ ...sound, name: sound.name || sound.title, tags: soundTags(sound), assetId: sound.assetId || "" }));
      refreshCategories(); render();
      document.querySelector("#native-section .native-notice span").textContent = "Preview instantly. Previewed/saved sounds cache locally for drag and drop.";
    } catch (error) {
      if (generation !== searchGeneration) return;
      remoteSounds = []; refreshCategories(); render();
      document.querySelector("#native-section .native-notice span").textContent = error.message;
    }
  }
  async function initialize() {
    offlineSounds = await window.desktop.listNativeSfx();
    refreshCategories(); render();
    for (const sound of offlineSounds.slice(0, 8)) { const preview = new Audio(sound.previewUrl); preview.preload = "auto"; warm.set(sound.id, preview); }
    searchMyInstants("");
  }
  grid.addEventListener("click", event => {
    const playButton = event.target.closest("[data-native-play]");
    const favoriteButton = event.target.closest("[data-native-favorite]");
    const saveButton = event.target.closest("[data-native-save]");
    if (favoriteButton) { event.stopPropagation(); const id = favoriteButton.dataset.nativeFavorite; favorites.has(id) ? favorites.delete(id) : favorites.add(id); persist(); render(); return; }
    if (saveButton) { event.stopPropagation(); prepare(allSounds().find(sound => sound.id === saveButton.dataset.nativeSave)); return; }
    if (playButton) play(allSounds().find(sound => sound.id === playButton.dataset.nativePlay));
  });
  grid.addEventListener("dragstart", event => {
    const card = event.target.closest(".remote-native[data-native-id]");
    if (!card) return;
    event.preventDefault(); event.stopImmediatePropagation();
    prepare(allSounds().find(sound => sound.id === card.dataset.nativeId));
    showMessage("Preparing MP3. Drag again when the card highlights.");
  });
  grid.addEventListener("contextmenu", event => {
    const item = event.target.closest("[data-native-id]"); if (!item) return;
    event.preventDefault(); contextSound = allSounds().find(sound => sound.id === item.dataset.nativeId);
    context.style.left = `${Math.min(event.clientX, innerWidth - 180)}px`; context.style.top = `${Math.min(event.clientY, innerHeight - 145)}px`; context.hidden = false;
  });
  context.addEventListener("click", async event => {
    const action = event.target.dataset.nativeAction; if (!action || !contextSound) return;
    if (action === "play") play(contextSound);
    if (["tray", "reveal", "copy"].includes(action) && !contextSound.assetId) await prepare(contextSound);
    if (action === "tray" && contextSound.assetId) await window.mediaGeckoHub?.addTray(contextSound.assetId);
    if (action === "reveal" && contextSound.assetId) window.desktop.revealFile(contextSound.assetId);
    if (action === "copy" && contextSound.assetId) { await window.desktop.copyFilePath(contextSound.assetId); showMessage("File path copied."); }
    if (action === "favorite") { favorites.has(contextSound.id) ? favorites.delete(contextSound.id) : favorites.add(contextSound.id); persist(); render(); }
    context.hidden = true;
  });
  document.addEventListener("pointerdown", event => { if (!event.target.closest("#native-context")) context.hidden = true; });
  [category, sort, favoritesOnly, recentOnly].forEach(control => control.addEventListener("change", render));
  search.addEventListener("input", () => { render(); clearTimeout(searchTimer); searchTimer = setTimeout(() => searchMyInstants(search.value.trim()), 320); });
  document.getElementById("native-filters-toggle").addEventListener("click", () => { document.getElementById("native-section").classList.toggle("filters-collapsed"); localStorage.setItem("media-gecko-native-filters", String(document.getElementById("native-section").classList.contains("filters-collapsed"))); });
  document.getElementById("native-section").classList.toggle("filters-collapsed", localStorage.getItem("media-gecko-native-filters") === "true");
  document.getElementById("native-clear-cache").addEventListener("click", async () => { await window.desktop.clearNativeSfxCache(); remoteSounds.forEach(sound => { sound.assetId = ""; }); render(); showMessage("MyInstants cache cleared. Offline pack and favorites kept."); });
  document.getElementById("native-myinstants").addEventListener("click", () => { search.value = ""; render(); searchMyInstants(""); });
  initialize().catch(error => showMessage(`Native SFX error: ${error.message}`));
  window.mediaGeckoNativeSfx = { activate: render, searchMyInstants };
})();
