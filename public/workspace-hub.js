(() => {
  const desktop = window.desktop;
  const command = document.querySelector("#command-palette");
  const commandInput = document.querySelector("#command-query");
  const commandResults = document.querySelector("#command-results");
  const tray = document.querySelector("#gecko-tray");
  const trayItems = document.querySelector("#tray-items");
  const context = document.querySelector("#universal-context");
  let commandItems = [];
  let commandFilter = "all";
  let commandSelected = 0;
  let commandTimer;
  let projects = [];
  let currentProject = null;
  let soundLabAssetId = "";
  const downloadJobs = new Map();

  const safe = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
  const visibleItems = () => commandItems.filter(item => {
    if (commandFilter === "all") return true;
    if (commandFilter === "local") return Boolean(item.assetId);
    if (commandFilter === "image") return ["IMAGE","PNG"].includes(item.type);
    if (commandFilter === "audio") return ["AUDIO","SFX"].includes(item.type);
    if (commandFilter === "tool") return ["TOOL","COMMAND","PROJECT","WHITEBOARD","HISTORY"].includes(item.type);
    return item.type.toLowerCase() === commandFilter || item.media === commandFilter;
  });
  function startDownload(label) {
    const id = crypto.randomUUID();
    downloadJobs.set(id, { id, label, state: "queued", percent: 0 });
    renderDownloads();
    return id;
  }
  function renderDownloads() {
    const box = document.querySelector("#download-queue");
    const items = [...downloadJobs.values()].sort((a,b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 20);
    const active = items.filter(item => ["queued","downloading","processing"].includes(item.state)).length;
    document.querySelector("#download-active").textContent = active;
    if (active) box.classList.remove("collapsed");
    document.querySelector("#download-jobs").innerHTML = items.map(item => `<article class="download-job ${safe(item.state)}"><div><b>${safe(item.label)}</b><span>${safe(item.state)} · ${Math.round(item.percent || 0)}% ${safe(item.speed || "")} ${item.eta ? `· ${safe(item.eta)}` : ""}</span></div><progress max="100" value="${Number(item.percent || 0)}"></progress>${["queued","downloading","processing"].includes(item.state) ? `<button data-cancel-job="${safe(item.id)}">×</button>` : ""}</article>`).join("") || '<div class="command-empty">No downloads this session.</div>';
  }

  function openSearch(seed = "") {
    command.hidden = false;
    commandInput.value = seed;
    commandSelected = 0;
    requestAnimationFrame(() => commandInput.focus());
    search(seed);
  }
  function closeSearch() { command.hidden = true; }
  async function search(value) {
    if (!desktop?.enabled) return;
    commandResults.innerHTML = '<div class="command-empty">SEARCHING…</div>';
    commandItems = await desktop.universalSearch(value);
    renderCommand();
    if (value.trim() && desktop.searchEnvato) desktop.searchEnvato(value).then(items => { if (commandInput.value === value && items.length) { commandItems.push(...items); renderCommand(); } }).catch(() => {});
  }
  function renderCommand() {
    const list = visibleItems();
    commandSelected = Math.min(commandSelected, Math.max(0, list.length - 1));
    commandResults.innerHTML = list.map((item, index) => `<article class="command-result ${index === commandSelected ? "selected" : ""}" data-command-index="${index}" ${item.assetId ? `draggable="true" data-asset-id="${safe(item.assetId)}"` : ""}><span class="command-type">${safe(item.type)}</span><div><b>${safe(item.label)}</b><small>${safe(item.subtitle || "Open search")}</small></div>${item.previewUrl && ["audio","video"].includes(item.kind) ? `<button class="command-preview" data-command-preview="${safe(item.previewUrl)}" data-preview-title="${safe(item.label)}">▶</button>` : ""}<em>${item.assetId ? "DRAG" : "OPEN"}</em></article>`).join("") || '<div class="command-empty">No matching results.</div>';
  }
  async function openCommandItem(item) {
    if (!item) return;
    closeSearch();
    if (item.assetId) {
      selectView("library", item.kind || "all");
      setTimeout(() => document.querySelector(`[data-asset-id="${CSS.escape(item.assetId)}"]`)?.click(), 80);
      desktop.markAssetUsed(item.assetId);
      return;
    }
    if (item.command === "clear-cache") { await desktop.clearCache("all"); showMessage("Cache cleared."); return; }
    if (item.command === "open-downloads") { document.querySelector("#download-queue").classList.remove("collapsed"); return; }
    if (item.url) { selectView("browser"); document.querySelector("#browser-url").value = item.url; document.querySelector("#browser-go").click(); return; }
    if (item.query) queryInput.value = item.query;
    if (item.view) selectView(item.view);
    if (item.query) setTimeout(() => document.querySelector("#search-form")?.requestSubmit(), 50);
  }

  commandInput.addEventListener("input", () => { clearTimeout(commandTimer); commandTimer = setTimeout(() => search(commandInput.value), 100); });
  commandInput.addEventListener("keydown", event => {
    const list = visibleItems();
    if (event.key === "ArrowDown") { event.preventDefault(); commandSelected = Math.min(list.length - 1, commandSelected + 1); renderCommand(); }
    if (event.key === "ArrowUp") { event.preventDefault(); commandSelected = Math.max(0, commandSelected - 1); renderCommand(); }
    if (event.key === "Enter") { event.preventDefault(); openCommandItem(list[commandSelected]); }
    if (event.key === "Escape") closeSearch();
  });
  commandResults.addEventListener("click", event => {
    const preview = event.target.closest("[data-command-preview]");
    if (preview) { event.stopPropagation(); playPreview(preview.dataset.commandPreview, preview.dataset.previewTitle, "Universal Search"); return; }
    openCommandItem(visibleItems()[Number(event.target.closest("[data-command-index]")?.dataset.commandIndex)]);
  });
  commandResults.addEventListener("mouseover", event => { const row = event.target.closest(".command-result"); if (row?.dataset.assetId) desktop.markAssetUsed(row.dataset.assetId); });
  commandResults.addEventListener("dragstart", event => { const id = event.target.closest("[data-asset-id]")?.dataset.assetId; if (id) { desktop.markAssetUsed(id); desktop.startDrag(id); } });
  command.addEventListener("mousedown", event => { if (event.target === command) closeSearch(); });
  document.querySelectorAll("[data-command-filter]").forEach(button => button.addEventListener("click", () => { commandFilter = button.dataset.commandFilter; document.querySelectorAll("[data-command-filter]").forEach(item => item.classList.toggle("active", item === button)); commandSelected = 0; renderCommand(); }));
  document.querySelector("#search-home-open")?.addEventListener("click", () => openSearch());

  function assetThumb(asset) {
    if (asset.kind === "image") return `<img src="${assetUrl(asset.id)}" alt="" draggable="false">`;
    if (asset.kind === "video") return '<span class="tray-kind">VID</span>';
    return '<span class="tray-wave">▂▅█▆▃</span>';
  }
  async function renderTray() {
    if (!desktop?.enabled) return;
    const items = await desktop.listTray();
    document.querySelector("#tray-count").textContent = items.length;
    trayItems.innerHTML = items.map(asset => `<article class="tray-item" draggable="true" data-asset-id="${safe(asset.id)}" title="${safe(asset.path)}">${assetThumb(asset)}<b>${safe(asset.name)}</b><button data-tray-remove="${safe(asset.id)}">×</button></article>`).join("") || '<span class="tray-empty">Right-click an asset and add it here.</span>';
  }
  async function addTray(id) { if (!id) return; await desktop.addTray(id); renderTray(); showMessage("Added to Gecko Tray."); }
  document.querySelector("#tray-toggle").addEventListener("click", () => { tray.classList.toggle("collapsed"); localStorage.setItem("media-gecko-tray-collapsed", String(tray.classList.contains("collapsed"))); });
  document.querySelector("#tray-clear").addEventListener("click", async () => { await desktop.clearTray(); renderTray(); });
  trayItems.addEventListener("click", async event => { const id = event.target.dataset.trayRemove; if (id) { await desktop.removeTray(id); renderTray(); } });
  trayItems.addEventListener("dragstart", event => { const id = event.target.closest("[data-asset-id]")?.dataset.assetId; if (id) { desktop.markAssetUsed(id); desktop.startDrag(id); } });
  tray.classList.toggle("collapsed", localStorage.getItem("media-gecko-tray-collapsed") !== "false");
  document.querySelector("#download-queue-toggle").addEventListener("click", event => event.currentTarget.parentElement.classList.toggle("collapsed"));
  document.querySelector("#download-jobs").addEventListener("click", event => { const id = event.target.dataset.cancelJob; if (id) fetch(`/api/download-cancel?id=${encodeURIComponent(id)}`, { method: "POST" }); });
  const downloadEvents = new EventSource("/api/download-events");
  downloadEvents.onmessage = event => { const job = JSON.parse(event.data); downloadJobs.set(job.id, job); renderDownloads(); if (job.state === "complete") loadLibrary(); };
  document.querySelector("#audio-loop")?.addEventListener("click", event => { audio.loop = !audio.loop; event.currentTarget.classList.toggle("active", audio.loop); });
  document.querySelector("#audio-speed")?.addEventListener("change", event => { audio.playbackRate = Number(event.target.value); });

  async function renderProjects() {
    if (!desktop?.enabled) return;
    const archived = document.querySelector("#project-show-archived")?.checked;
    projects = await desktop.listProjects(archived);
    const list = document.querySelector("#project-list");
    list.innerHTML = projects.map(project => `<button class="project-row ${currentProject?.id === project.id ? "active" : ""}" data-project-id="${safe(project.id)}"><b>${safe(project.name)}</b><span>${project.assets.length} assets${project.archived ? " · archived" : ""}</span></button>`).join("") || '<div class="command-empty">No projects yet.</div>';
    if (currentProject) currentProject = projects.find(item => item.id === currentProject.id) || null;
    renderProjectDetail();
  }
  function renderProjectDetail() {
    const target = document.querySelector("#project-detail");
    if (!currentProject) { target.innerHTML = '<div class="no-assets">Select or create project.</div>'; return; }
    target.innerHTML = `<header><input id="project-name" value="${safe(currentProject.name)}"><div><button data-project-command="duplicate">DUPLICATE</button><button data-project-command="archive">${currentProject.archived ? "RESTORE" : "ARCHIVE"}</button><button data-project-command="delete">DELETE</button></div></header><textarea id="project-notes" placeholder="Edit notes, links, status…">${safe(currentProject.notes || "")}</textarea><div class="project-assets">${currentProject.assets.map(asset => `<article class="project-asset" draggable="true" data-asset-id="${safe(asset.id)}">${assetThumb(asset)}<b>${safe(asset.name)}</b><small>${safe(asset.category)}</small></article>`).join("") || '<div class="no-assets">Add assets from any context menu.</div>'}</div>`;
  }
  document.querySelector("#project-new")?.addEventListener("click", async () => { currentProject = await desktop.saveProject({ name: `Project ${projects.length + 1}` }); await renderProjects(); });
  document.querySelector("#project-show-archived")?.addEventListener("change", renderProjects);
  document.querySelector("#project-list")?.addEventListener("click", event => { currentProject = projects.find(item => item.id === event.target.closest("[data-project-id]")?.dataset.projectId); renderProjects(); });
  document.querySelector("#project-detail")?.addEventListener("change", async event => { if (!currentProject) return; if (event.target.id === "project-name") currentProject = await desktop.saveProject({ id: currentProject.id, name: event.target.value }); if (event.target.id === "project-notes") currentProject = await desktop.saveProject({ id: currentProject.id, notes: event.target.value }); renderProjects(); });
  document.querySelector("#project-detail")?.addEventListener("click", async event => {
    const action = event.target.dataset.projectCommand; if (!action || !currentProject) return;
    if (action === "duplicate") currentProject = await desktop.saveProject({ name: `${currentProject.name} Copy`, notes: currentProject.notes, assetIds: currentProject.assetIds, boardIds: currentProject.boardIds });
    if (action === "archive") currentProject = await desktop.saveProject({ id: currentProject.id, archived: !currentProject.archived });
    if (action === "delete" && confirm(`Delete project “${currentProject.name}”? Assets stay in library.`)) { await desktop.deleteProject(currentProject.id); currentProject = null; }
    renderProjects();
  });
  document.querySelector("#project-detail")?.addEventListener("dragstart", event => { const id = event.target.closest("[data-asset-id]")?.dataset.assetId; if (id) desktop.startDrag(id); });

  const smart = [["recentAdded","Recently Added"],["recentUsed","Recently Used"],["favorites","Favorites"],["large","Large Files"],["transparent","Transparent Images"],["videos","Videos"],["vertical","Vertical Video"],["fourK","4K Video"],["sfx","Sound Effects"],["gifs","GIFs"],["downloads","Downloads"],["unused","Unused"]];
  let organizerItems = [];
  function openOrganizer() { document.querySelector("#organizer-panel").hidden = false; loadSmart("recentAdded"); }
  function renderOrganizerItems(filter = "") {
    const term=filter.trim().toLowerCase();
    const items=organizerItems.filter(asset=>!term||`${asset.name} ${asset.category} ${asset.kind} ${asset.tags?.join(" ")||""}`.toLowerCase().includes(term));
    const target=document.querySelector("#organizer-results");
    target.innerHTML = `<header class="organizer-toolbar"><div><b>${items.length} RESULTS</b><span>Click to preview · drag into editor</span></div><input id="organizer-search" value="${safe(filter)}" placeholder="Filter this folder…"><button id="organizer-import-files">＋ FILES</button><button id="organizer-import-folder">＋ FOLDER</button></header><div class="organizer-grid">${items.map(asset => `<article class="organizer-asset" draggable="true" data-asset-id="${safe(asset.id)}">${assetThumb(asset)}<div><b>${safe(asset.name)}</b><small>${safe(asset.kind)} · ${safe(asset.category)}</small></div>${asset.kind === "audio" ? `<button class="organizer-preview" data-preview="${assetUrl(asset.id)}" data-title="${safe(asset.name)}" title="Preview">▶</button>` : ""}</article>`).join("") || '<div class="no-assets">Nothing here. Import files or choose another folder.</div>'}</div>`;
    const search=document.querySelector("#organizer-search"); if(search){search.focus({preventScroll:true});search.setSelectionRange(search.value.length,search.value.length);}
  }
  async function loadSmart(key) {
    const target = document.querySelector("#organizer-results"); target.innerHTML = '<div class="command-empty">INDEX QUERY…</div>';
    organizerItems = await desktop.smartFolder(key, 1000);
    renderOrganizerItems();
    document.querySelectorAll("#smart-folders button").forEach(button => button.classList.toggle("active", button.dataset.smart === key));
  }
  document.querySelector("#smart-folders").innerHTML = smart.slice(0,6).map(([key,label]) => `<button data-smart="${key}">${label}</button>`).join("") + `<details><summary>MORE FOLDERS</summary>${smart.slice(6).map(([key,label]) => `<button data-smart="${key}">${label}</button>`).join("")}</details>`;
  document.querySelector("#smart-folders").addEventListener("click", event => { const key = event.target.dataset.smart; if (key) loadSmart(key); });
  document.querySelector("#organizer-results").addEventListener("dragstart", event => { const id = event.target.closest("[data-asset-id]")?.dataset.assetId; if (id) desktop.startDrag(id); });
  document.querySelector("#organizer-results").addEventListener("input", event => { if(event.target.id === "organizer-search") renderOrganizerItems(event.target.value); });
  document.querySelector("#organizer-results").addEventListener("click", event => { const preview=event.target.closest("[data-preview]"); if(preview){playPreview(preview.dataset.preview,preview.dataset.title,"Organizer");return;} if(event.target.id === "organizer-import-files") document.querySelector("#import-files").click(); if(event.target.id === "organizer-import-folder") document.querySelector("#import-folder").click(); });
  document.querySelector("#organizer-close").addEventListener("click", () => document.querySelector("#organizer-panel").hidden = true);
  document.querySelector("#organizer-panel").addEventListener("mousedown", event => { if (event.target.id === "organizer-panel") event.currentTarget.hidden = true; });
  document.querySelector("#open-organizer")?.addEventListener("click", openOrganizer);
  document.querySelector("#organizer-open")?.addEventListener("click", openOrganizer);

  async function scanDuplicates() {
    showMessage("Scanning exact file hashes…");
    const groups = await desktop.findDuplicates();
    document.querySelector("#organizer-panel").hidden = false;
    const duplicateHtml = groups.map(group => `<section class="duplicate-group"><b>${group.assets.length} copies · ${bytes(group.size)}</b>${group.assets.map(asset => `<article class="organizer-asset" draggable="true" data-asset-id="${safe(asset.id)}"><div><b>${safe(asset.name)}</b><small>${safe(asset.path)}</small></div></article>`).join("")}</section>`).join("");
    document.querySelector("#organizer-results").innerHTML = `<header>${groups.length} EXACT DUPLICATE GROUPS · REVIEW ONLY</header>${duplicateHtml || '<div class="no-assets">No exact duplicates found.</div>'}`;
  }
  document.querySelector("#duplicates-scan")?.addEventListener("click", scanDuplicates);
  async function loadEnvatoStatus() { if(!desktop.envatoStatus)return; const status=await desktop.envatoStatus(); document.querySelector("#envato-status").textContent=status.connected?"Connected · encrypted on this PC":"Not connected"; }
  document.querySelector("#envato-test")?.addEventListener("click",async event=>{event.currentTarget.disabled=true;try{const token=document.querySelector("#envato-token").value.trim();if(token)await desktop.setEnvatoToken(token);await desktop.testEnvato();document.querySelector("#envato-token").value="";showMessage("Envato connected. Results now appear in Universal Search.");}catch(error){showMessage(error.message);}finally{event.currentTarget.disabled=false;loadEnvatoStatus();}});

  async function renderWatched() {
    const folders = await desktop.listWatchedFolders();
    document.querySelector("#watched-folders").innerHTML = folders.map(folder => `<div><span>${safe(folder)}</span><button data-unwatch="${safe(folder)}">REMOVE</button></div>`).join("") || '<small>No watched folders.</small>';
  }
  document.querySelector("#watched-add")?.addEventListener("click", async () => { await desktop.addWatchedFolder(); renderWatched(); });
  document.querySelector("#watched-folders")?.addEventListener("click", async event => { if (event.target.dataset.unwatch) { await desktop.removeWatchedFolder(event.target.dataset.unwatch); renderWatched(); } });

  async function showContext(event) {
    const host = event.target.closest("[data-asset-id]"); if (!host?.dataset.assetId) return;
    event.preventDefault(); const id = host.dataset.assetId;
    const availableProjects = await desktop.listProjects(false);
    context.innerHTML = `<button data-context="preview">PREVIEW</button><button data-context="lab">OPEN IN SFX LAB</button><button data-context="tray">ADD TO GECKO TRAY</button><button data-context="reveal">SHOW IN EXPLORER</button><button data-context="copy">COPY FILE PATH</button><button data-context="similar">FIND SIMILAR</button>${availableProjects.map(project => `<button data-context="project" data-project-id="${safe(project.id)}">ADD TO ${safe(project.name)}</button>`).join("")}`;
    context.dataset.assetId = id; context.hidden = false;
    context.style.left = `${Math.min(event.clientX, innerWidth - 220)}px`; context.style.top = `${Math.min(event.clientY, innerHeight - context.offsetHeight - 8)}px`;
  }
  document.addEventListener("contextmenu", showContext);
  document.addEventListener("mousedown", event => { if (!event.target.closest("#universal-context")) context.hidden = true; });
  context.addEventListener("click", async event => {
    const action = event.target.dataset.context; const id = context.dataset.assetId; if (!action) return;
    if (action === "tray") await addTray(id);
    if (action === "reveal") desktop.revealFile(id);
    if (action === "copy") { await desktop.copyFilePath(id); showMessage("File path copied."); }
    if (action === "preview") document.querySelector(`[data-asset-id="${CSS.escape(id)}"] .asset-preview`)?.click();
    if (action === "project") { await desktop.addProjectAsset(event.target.dataset.projectId, id); showMessage("Added to project."); }
    if (action === "similar") { const matches = await desktop.findSimilar(id); assets = matches; selectView("library", matches[0]?.kind || "all"); renderLibrary(); }
    if (action === "lab") openSoundLab(id);
    context.hidden = true;
  });

  function openSoundLab(id) {
    soundLabAssetId = id;
    const asset = assets.find(item => item.id === id);
    if (asset?.kind && asset.kind !== "audio") return showMessage("SFX Lab accepts audio files.");
    document.querySelector("#sound-lab").hidden = false;
    document.querySelector("#sound-lab-name").textContent = asset?.name || "Audio asset";
    const player = document.querySelector("#sound-lab-audio"); player.src = assetUrl(id); player.play().catch(() => {});
  }
  document.querySelector("#sound-lab-close").addEventListener("click", () => { document.querySelector("#sound-lab").hidden = true; document.querySelector("#sound-lab-audio").pause(); });
  document.querySelectorAll("#sound-lab input[type=range]").forEach(input => input.addEventListener("input", () => { input.nextElementSibling.textContent = input.id.includes("speed") || input.id.includes("pitch") ? `${Number(input.value).toFixed(2)}×` : `${input.value} dB`; if (input.id === "lab-speed") document.querySelector("#sound-lab-audio").playbackRate = Number(input.value); }));
  document.querySelector("#sound-lab-render").addEventListener("click", async event => {
    event.currentTarget.disabled = true; event.currentTarget.textContent = "RENDERING";
    try {
      const value = id => document.querySelector(id);
      const rendered = await desktop.renderSoundLab(soundLabAssetId, { speed:value("#lab-speed").value, pitch:value("#lab-pitch").value, bass:value("#lab-bass").value, treble:value("#lab-treble").value, trimStart:value("#lab-trim-start").value, trimEnd:value("#lab-trim-end").value, reverb:value("#lab-reverb").checked, reverse:value("#lab-reverse").checked, normalize:value("#lab-normalize").checked, mono:value("#lab-mono").checked });
      await addTray(rendered.id); await loadLibrary(); showMessage("Processed SFX ready in Gecko Tray.");
    } catch (error) { showMessage(error.message); }
    finally { event.currentTarget.disabled = false; event.currentTarget.textContent = "RENDER TO TRAY"; }
  });

  document.querySelectorAll(".group-toggle").forEach(button => {
    const key = `media-gecko-group-${button.dataset.groupToggle}`;
    const group = button.nextElementSibling;
    if (localStorage.getItem(key) === "collapsed") group.hidden = true;
    button.querySelector("span").textContent = group.hidden ? "+" : "−";
    button.addEventListener("click", () => { group.hidden = !group.hidden; button.querySelector("span").textContent = group.hidden ? "+" : "−"; localStorage.setItem(key, group.hidden ? "collapsed" : "open"); });
  });

  document.addEventListener("dragstart", event => { const id = event.target.closest("[data-asset-id]")?.dataset.assetId; if (id) desktop.markAssetUsed(id); });
  desktop?.onLibraryUpdated?.(() => { loadLibrary(); renderTray(); });
  desktop?.onIndexProgress?.(state => showMessage(`Indexing ${state.current || 0}/${state.total || 0} · ${state.added || 0} added`));
  desktop?.onUniversalResult?.(item => openCommandItem(item));
  window.addEventListener("keydown", event => { if (event.key === "Escape") { closeSearch(); context.hidden = true; document.querySelector("#organizer-panel").hidden = true; } });

  function renderRecent() { document.querySelector("#search-recent").innerHTML = '<button class="recent-search" data-seed="whoosh">WHOOSH SFX</button><button class="recent-search" data-seed="transparent smoke">TRANSPARENT SMOKE</button><button class="recent-search" data-seed="cinematic hit">CINEMATIC HIT</button>'; }
  document.querySelector("#search-recent")?.addEventListener("click", event => { if (event.target.dataset.seed) openSearch(event.target.dataset.seed); });
  renderRecent(); renderTray(); renderWatched(); loadEnvatoStatus();
  window.mediaGeckoHub = { openSearch, renderRecent, renderProjects, renderTray, addTray, openOrganizer, startDownload };
})();
