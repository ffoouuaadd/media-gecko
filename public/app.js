const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const sections = ["search", "youtube", "online", "downloader", "sources", "png", "library", "browser", "native", "projects", "settings"];
const categories = ["Whooshes","Impacts","Hits","Risers","Downers","Glitches","UI / Interface","Transitions","Ambience","Nature","Vehicles","Weapons","Footsteps","Crowd","Technology","Gaming","Comedy / Meme","Cinematic","Other","Images","Video"];
const views = {
  youtube: ["YouTube Media", "Preview, download MP3 or MP4, then drag into your editor.", "MP3 · MP4", "Search YouTube media…"],
  online: ["Free SFX Search", "Low-bandwidth preview. Full file caches for drag.", "FAST PREVIEW · DRAG", "Search free sound effects…"],
  downloader: ["Social Downloader", "Analyze public Instagram, TikTok, or YouTube media.", "MP4 · MP3", "Paste a public media URL…"],
  sources: ["Sound Libraries", "Search external free SFX catalogs.", "6 SOURCES", "Search sound libraries…"],
  pngsources: ["Image Search", "Search usable photos or transparent PNG assets.", "NORMAL · TRANSPARENT", "Search images…"],
  browser: ["Browser", "Browse asset sites. Downloads enter library automatically.", "WEB · LIBRARY", "Search web or enter URL…"],
  native: ["Native SFX", "Original offline sounds. Search, preview, favorite, drag.", "136 ORIGINAL · OFFLINE", ""],
  search: ["Universal Search", "Search every Media Gecko workspace and provider.", "CTRL K · ALT SPACE", "Search local assets, projects, and SFX…"],
  projects: ["Projects", "Keep edit assets, notes, and downloads together.", "WORKSPACE", "Search projects…"],
  library: ["My Library", "Indexed original files. Search, preview, organize, and drag.", "LOCAL · INDEXED", "Search name, tag, or category…"],
  settings: ["Settings & Storage", "Control temporary media cache without touching imported files.", "CACHE", ""],
};
const defaultUiSettings = {
  startupTab: "youtube", rememberLastTab: true, lastTab: "youtube", sidebarMode: "full", autoSidebar: true,
  density: "compact", defaultView: "tile", iconSize: "medium", thumbnailSize: "medium", previewVolume: 0.8,
  autoplay: false, hoverDelay: 300, animation: "subtle", reduceMotion: false, autoCleanup: true,
  launchMinimized: false, startWindows: false, restoreWindow: true, hardwareAcceleration: true, performanceMode: false, confirmDelete: true,
  appearance: "dark", theme: "devo", colors: { primary: "#ff4e18", secondary: "#c93c13", icon: "#ef8e6a", selection: "#5a3023", glow: "#ff4e18", button: "#8a452d", progress: "#ff5a1f", waveform: "#ff7040" },
};
const themePresets = {
  devo: { name: "Ember", colors: defaultUiSettings.colors },
  cyber: { name: "Electric Blue", colors: { primary:"#16a8ff",secondary:"#075b9b",icon:"#65c6ff",selection:"#173c52",glow:"#008cff",button:"#17628e",progress:"#22b8ff",waveform:"#5acbff" } },
  purple: { name: "Violet", colors: { primary:"#b34cff",secondary:"#6d1f9c",icon:"#d793ff",selection:"#48245f",glow:"#d12cff",button:"#74379b",progress:"#d158ff",waveform:"#e181ff" } },
  oled: { name: "Pure Black", colors: { primary:"#f2f2f2",secondary:"#777777",icon:"#ffffff",selection:"#272727",glow:"#ffffff",button:"#555555",progress:"#ffffff",waveform:"#d0d0d0" } },
  daylight: { name: "Warm Light", appearance:"light", colors: { primary:"#d9440f",secondary:"#a92f09",icon:"#c83a0c",selection:"#ffe0d3",glow:"#ff6a32",button:"#d65a2b",progress:"#e64c16",waveform:"#f2632e" } },
  studio: { name: "Cool Light", appearance:"light", colors: { primary:"#096fbd",secondary:"#074f88",icon:"#0967aa",selection:"#d9edff",glow:"#199cff",button:"#247ab5",progress:"#0b82d8",waveform:"#2799e7" } },
};
function loadStoredSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("media-gecko-settings") || "{}");
    return { ...defaultUiSettings, ...stored, colors: { ...defaultUiSettings.colors, ...(stored.colors || {}) } };
  } catch { return structuredClone(defaultUiSettings); }
}
let uiSettings = loadStoredSettings();
let activeView = "youtube";
let activeKind = "all";
let viewMode = localStorage.getItem("media-gecko-view") || uiSettings.defaultView || "tile";
let imageMode = localStorage.getItem("media-gecko-image-mode") || "normal";
if (!localStorage.getItem("media-gecko-whole-web-images-v1")) {
  imageMode = "normal";
  localStorage.setItem("media-gecko-image-mode", imageMode);
  localStorage.setItem("media-gecko-whole-web-images-v1", "true");
}
let assets = [];
let libraryPage = 0;
let libraryRenderSerial = 0;
let libraryFilterKey = "";
let selectedAsset = null;
let remoteSelected = null;
let imageResults = [];
let imageFilter = "all";
let searchGeneration = 0;
let toastTimer;
const resultCache = new Map();
const warmAudio = new Map();
let onlineResults = [];
const sfxFavorites = new Set(JSON.parse(localStorage.getItem("media-gecko-sfx-favorites") || "[]"));
const recentlyUsed = new Map();

const iconPaths = {
  youtube: '<path d="M5 7.5h14v9H5z"/><path d="m10 10 4 2-4 2z"/>',
  wave: '<path d="M3 12h2m2-4v8m3-11v14m3-10v6m3-8v10m3-5h2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 20h14"/>',
  external: '<path d="M10 6H5v13h13v-5M13 5h6v6m0-6-9 9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="1"/><path d="m17 10 4-3v10l-4-3z"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/>',
  wind: '<path d="M3 8h10c3 0 3-4 0-4-1.2 0-2 .6-2.4 1.5M3 12h16c3 0 3 4 0 4-1.2 0-2-.6-2.4-1.5M3 16h7"/>',
  impact: '<path d="m12 2 2.2 6.2L20 5l-3.2 5.8L23 13l-6.2 2.2L20 21l-5.8-3.2L12 24l-2.2-6.2L4 21l3.2-5.8L1 13l6.2-2.2L4 5l5.8 3.2z"/>',
  cursor: '<path d="M5 3v16l4-4 3 6 3-2-3-6h6z"/>',
  nature: '<path d="M4 19c5-1 8-5 9-14 5 3 7 8 5 12-2 4-8 4-14 2Zm4-2c3-3 6-5 10-7"/>',
  car: '<path d="m5 15 2-6h10l2 6M3 15h18v4H3z"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  footsteps: '<ellipse cx="9" cy="8" rx="3" ry="5"/><ellipse cx="16" cy="16" rx="3" ry="5"/>',
  chip: '<rect x="7" y="7" width="10" height="10"/><path d="M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m10 0h4M3 15h4m10 0h4"/>',
  game: '<path d="M6 9h12l3 8-3 2-3-3H9l-3 3-3-2z"/><path d="M8 11v4m-2-2h4m6-1h.1m2 2h.1"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-5 12-5 12 0m0-6c4-1 7 1 7 5"/>',
  generic: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>',
};
function iconSvg(name, className = "") { return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.generic}</svg>`; }
function categoryIcon(category) {
  if (/whoosh|riser|downer|transition/i.test(category)) return "wind";
  if (/impact|hit|weapon|cinematic/i.test(category)) return "impact";
  if (/ui|interface/i.test(category)) return "cursor";
  if (/nature|ambience/i.test(category)) return "nature";
  if (/vehicle/i.test(category)) return "car";
  if (/footstep/i.test(category)) return "footsteps";
  if (/technology|glitch/i.test(category)) return "chip";
  if (/gaming|comedy|meme/i.test(category)) return "game";
  if (/crowd/i.test(category)) return "people";
  if (/image|photo|png/i.test(category)) return "image";
  if (/video/i.test(category)) return "video";
  return "wave";
}
function classifySfx(title) {
  const text = String(title || "").toLowerCase();
  const rules = [["Whooshes",/whoosh|swoosh|swish|flyby/],["Impacts",/impact|slam|crash|thud|metal/],["Hits",/\bhit\b|punch|smack/],["Risers",/riser|rise|build/],["Downers",/downer|drop|fall/],["Glitches",/glitch|stutter|digital/],["UI / Interface",/\bui\b|interface|button|click|beep/],["Transitions",/transition|sweep|wipe/],["Ambience",/ambience|ambient|atmosphere|room tone/],["Nature",/rain|wind|thunder|water|ocean|forest|bird/],["Vehicles",/car|vehicle|engine|train|plane/],["Weapons",/gun|shot|rifle|sword|explosion/],["Footsteps",/footstep|walking|running|shoe/],["Crowd",/crowd|cheer|applause/],["Technology",/computer|robot|machine|cyber|sci.?fi/],["Gaming",/game|arcade|level up|coin/],["Comedy / Meme",/funny|meme|vine|boing|bonk/],["Cinematic",/cinematic|trailer|braam|epic/]];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "Other";
}

const form = $("#search-form");
const queryInput = $("#query");
const searchButton = $(".search-button");
const message = $("#message");
const audio = $("#audio");
const audioDeck = $("#audio-deck");
const seek = $("#seek");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[character]);
}
function time(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function bytes(size) {
  if (!Number.isFinite(size) || size <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function showMessage(text = "") {
  clearTimeout(toastTimer);
  message.textContent = text;
  message.hidden = !text;
  if (text) toastTimer = setTimeout(() => { message.hidden = true; }, 6000);
}
function showSection(name, visible = true) {
  sections.forEach(section => {
    const element = $(`#${section}-section`);
    element.hidden = !visible || section !== name;
    element.classList.toggle("section-enter", visible && section === name);
  });
  $("#empty").hidden = visible;
}
function assetUrl(id) {
  return `/api/library/file?id=${encodeURIComponent(id)}`;
}

async function checkHealth() {
  try {
    const data = await fetch("/api/health").then(response => response.json());
    const ready = data.ytDlp && data.ffmpeg;
    $("#health").textContent = ready ? "Media engine ready" : "Media engine unavailable";
    $("#health-dot").classList.toggle("ready", ready);
    if (data.libraryRecovery) showMessage(data.libraryRecovery.message);
  } catch { $("#health").textContent = "Local server unavailable"; }
}

async function loadLibrary() {
  assets = window.desktop?.enabled ? await window.desktop.listLibrary({ limit: 2000 }) : (await fetch("/api/library").then(response => response.json())).assets;
  const total = window.desktop?.enabled ? await window.desktop.libraryCount() : assets.length;
  $("#library-count").textContent = total;
  const values = [...new Set([...categories, ...assets.map(asset => asset.category)])];
  renderCategoryChips(values);
  if (activeView === "library") renderLibrary();
}

function renderSkeleton(target, count = 6, image = false) {
  target.innerHTML = Array.from({ length: count }, () => image
    ? '<div class="image-result skeleton-image"><i></i><b></b></div>'
    : '<div class="media-row skeleton"><i></i><div><b></b><span></span></div><em></em></div>').join("");
}

function youtubeRow(item) {
  return `
    <article class="media-row youtube-row" data-id="${escapeHtml(item.id)}">
      <button class="play" data-preview="/api/youtube-preview?url=${encodeURIComponent(item.url)}" data-title="${escapeHtml(item.title)}" data-source="YouTube">▶</button>
      <div class="media-thumb" style="background-image:url('${escapeHtml(item.thumbnail)}')"><button class="video-play" data-video-preview="/api/youtube-video-preview?url=${encodeURIComponent(item.url)}" data-title="${escapeHtml(item.title)}">▶ VIDEO</button><span>${time(item.duration)}</span></div>
      <div class="media-info"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.channel)}</p><small>Choose format, download, then drag row</small></div>
      <div class="download-options">
        <select class="format-select"><option value="mp3">MP3</option><option value="mp4">MP4</option></select>
        <select class="quality-select" hidden><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select>
        <button class="download" data-url="${escapeHtml(item.url)}">DOWNLOAD</button>
      </div>
    </article>`;
}

function onlineRow(item) {
  const cached = item.assetId || assets.find(asset => asset.remoteUrl === item.url)?.id || "";
  const favorite = sfxFavorites.has(item.url);
  const category = item.category || classifySfx(item.title);
  const format = (item.mime || item.url || "").match(/(?:audio\/|\.)(mp3|mpeg|wav|ogg|opus|m4a)/i)?.[1]?.replace("mpeg", "mp3") || "audio";
  return `
    <article class="media-row online-row ${cached ? "drag-ready draggable" : ""}" ${cached ? 'draggable="true"' : ""} data-asset-id="${cached}" data-online-url="${escapeHtml(item.url)}" data-online-title="${escapeHtml(item.title)}" data-online-source="${escapeHtml(item.source)}" data-duration="${Number(item.duration || 0)}" data-category="${escapeHtml(category)}" data-format="${format}">
      <button class="play" data-preview="${escapeHtml(item.previewUrl || item.url)}" data-title="${escapeHtml(item.title)}" data-source="${escapeHtml(item.source)}">▶</button>
      <div class="wave-mini"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="media-info"><h3>${escapeHtml(item.title)}</h3><p><mark>${escapeHtml(item.source)}</mark> · ${escapeHtml(category)} · ${escapeHtml(item.license)}${item.duration ? ` · ${time(item.duration)}` : ""}</p><small>${bytes(item.size)} · ${format.toUpperCase()} · preview streams only</small></div>
      <div class="online-actions"><button class="sfx-favorite ${favorite ? "active" : ""}" title="Favorite">★</button><a href="${escapeHtml(item.pageUrl)}" target="_blank" rel="noreferrer">LICENSE</a><button class="sfx-download" title="Download full file">DOWNLOAD</button><button class="cache drag-handle" title="Drag into editor">${cached ? "DRAG" : "PREP DRAG"}</button></div>
    </article>`;
}

function imageCard(item) {
  const alpha = Boolean(item.transparent) || imageMode === "transparent";
  const cached = item.assetId || assets.find(asset => asset.remoteUrl === (item.originalUrl || item.thumbnail))?.id || "";
  return `
    <article class="image-result ${cached ? "drag-ready draggable" : ""}" ${cached ? 'draggable="true"' : ""} data-asset-id="${cached}" data-image-index="${item.index}" data-thumbnail="${escapeHtml(item.thumbnail)}" data-title="${escapeHtml(item.title)}" data-source-url="${escapeHtml(item.sourceUrl || "")}">
      <div class="image-result-thumb ${alpha ? "checker" : ""}"><img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" draggable="false"><span class="image-loading">LOADING</span></div>
      <div class="image-result-copy"><b>${escapeHtml(item.title)}</b><span>${item.width} × ${item.height}${alpha ? " · PNG" : ""}</span><small>${escapeHtml(item.provider || "Google")}${item.sourceDomain ? ` · ${escapeHtml(item.sourceDomain)}` : ""} · ${escapeHtml(item.license || "Web result · verify usage rights")}</small></div>
      <button class="prepare-image" title="Cache original for drag">${cached ? "READY" : "PREP"}</button>
    </article>`;
}

function prewarmAudioResults(items, type) {
  if (uiSettings.performanceMode) return;
  if (type === "youtube") {
    fetch("/api/youtube-prewarm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: items.slice(0, 4).map(item => item.url) }),
    }).catch(() => {});
    fetch("/api/youtube-video-prewarm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: items.slice(0, 2).map(item => item.url) }),
    }).catch(() => {});
    return;
  }
  for (const item of items.slice(0, 4)) {
    const url = item.previewUrl || item.url;
    if (warmAudio.has(url)) continue;
    const preview = new Audio();
    preview.preload = "metadata";
    preview.src = url;
    warmAudio.set(url, preview);
  }
  while (warmAudio.size > 12) {
    const first = warmAudio.keys().next().value;
    warmAudio.get(first).removeAttribute("src");
    warmAudio.delete(first);
  }
}

function renderCached(view, data) {
  if (view === "youtube") {
    $("#youtube-results").innerHTML = data.youtube.map(youtubeRow).join("");
    showSection("youtube");
    $("#result-count").textContent = `${data.youtube.length} YouTube results · cached`;
    prewarmAudioResults(data.youtube, "youtube");
  } else if (view === "online") {
    onlineResults = data.results || [];
    refreshSfxFilters();
    renderOnlineResults();
    showSection("online");
    $("#result-count").textContent = `${onlineResults.length} open-audio results · metadata cached`;
  } else if (view === "sources") {
    libraryLinks(data.libraries, $("#source-results"));
    showSection("sources");
    $("#result-count").textContent = `${data.libraries.length} sound libraries`;
  } else if (view === "pngsources") {
    imageResults = data;
    const filtered = data.filter(item => {
      if (imageFilter === "large") return Number(item.width) >= 1200 || Number(item.height) >= 1200;
      if (imageFilter === "square") return item.width && item.height && Math.abs(item.width / item.height - 1) < .18;
      if (imageFilter === "portrait") return Number(item.height) > Number(item.width);
      if (imageFilter === "landscape") return Number(item.width) > Number(item.height);
      if (imageFilter === "gif") return /gif/i.test(`${item.title} ${item.originalUrl || item.thumbnail}`);
      return true;
    });
    $("#png-results").innerHTML = filtered.map(imageCard).join("") || '<div class="no-assets">No images match this filter.</div>';
    showSection("png");
    $("#result-count").textContent = `${filtered.length} image results · session cached`;
  }
}

function refreshSfxFilters() {
  const sources = [...new Set(onlineResults.map(item => item.source).filter(Boolean))].sort();
  const source = $("#sfx-source").value;
  $("#sfx-source").innerHTML = '<option value="">All sources</option>' + sources.map(value => `<option ${value === source ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  const foundCategories = [...new Set(onlineResults.map(item => item.category || classifySfx(item.title)))].sort();
  const category = $("#sfx-category").value;
  $("#sfx-category").innerHTML = '<option value="">Any category</option>' + foundCategories.map(value => `<option ${value === category ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderOnlineResults() {
  const duration = $("#sfx-duration").value;
  const category = $("#sfx-category").value;
  const source = $("#sfx-source").value;
  const format = $("#sfx-format").value;
  const channel = $("#sfx-channel").value;
  const quality = $("#sfx-quality").value;
  const favoritesOnly = $("#sfx-favorites").checked;
  const downloadedOnly = $("#sfx-downloaded").checked;
  const recentOnly = $("#sfx-recent").checked;
  const sort = $("#sfx-sort").value;
  const filtered = onlineResults.filter(item => {
    const seconds = Number(item.duration || 0);
    const itemCategory = item.category || classifySfx(item.title);
    const itemFormat = (item.mime || item.url || "").toLowerCase();
    const cached = item.assetId || assets.some(asset => asset.remoteUrl === item.url);
    if (duration === "short" && (!seconds || seconds >= 5)) return false;
    if (duration === "medium" && (seconds < 5 || seconds > 15)) return false;
    if (duration === "long" && seconds <= 15) return false;
    if (category && itemCategory !== category) return false;
    if (source && item.source !== source) return false;
    if (format && !itemFormat.includes(format) && !(format === "mp3" && itemFormat.includes("mpeg"))) return false;
    if (channel && String(item.channels || "").toLowerCase() !== channel) return false;
    if (quality === "lossless" && !/(wav|flac)/.test(itemFormat)) return false;
    if (quality === "compressed" && /(wav|flac)/.test(itemFormat)) return false;
    if (favoritesOnly && !sfxFavorites.has(item.url)) return false;
    if (downloadedOnly && !cached) return false;
    if (recentOnly && !recentlyUsed.has(item.url)) return false;
    return true;
  });
  if (sort === "shortest") filtered.sort((a, b) => (a.duration || Infinity) - (b.duration || Infinity));
  if (sort === "longest") filtered.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  if (sort === "popular") filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (sort === "newest") filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  $("#online-results").innerHTML = filtered.map(onlineRow).join("") || '<div class="no-assets">No sounds match current filters.</div>';
  $("#result-count").textContent = `${filtered.length} shown · ${onlineResults.length} found`;
}

function interleaveProviderResults(providers, byProvider, limit = 20) {
  const output = [];
  const seen = new Set();
  for (let index = 0; output.length < limit; index++) {
    let found = false;
    for (const provider of providers) {
      const item = (byProvider.get(provider) || [])[index];
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      output.push(item);
      found = true;
    }
    if (!found) break;
  }
  return output;
}

function rankSfxResults(items, query) {
  const phrase = query.toLowerCase().trim();
  const tokens = phrase.split(/\s+/).filter(token => token.length > 1);
  const frequency = new Map(tokens.map(token => [token, items.filter(item => String(item.title || "").toLowerCase().includes(token)).length]));
  return items.map((item, index) => {
    const title = String(item.title || "").toLowerCase();
    const matched = tokens.filter(token => title.includes(token)).length;
    const rareMatch = tokens.filter(token => title.includes(token)).reduce((score, token) => score + Math.max(0, items.length - (frequency.get(token) || 0)) * 5, 0);
    const score = (title.includes(phrase) ? 120 : 0) + matched * 25 + rareMatch + (matched === tokens.length ? 45 : 0) + Math.max(0, 10 - index / 2);
    return { item, score };
  }).sort((a, b) => b.score - a.score).map(entry => entry.item);
}

function libraryLinks(items, target, image = false) {
  target.innerHTML = items.map((item, index) => `
    <button class="library-link ${image ? "image-link" : ""}" data-browser-url="${escapeHtml(item.url)}">
      <span>${String(index + 1).padStart(2, "0")}</span><div><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.note)}</small></div><i>OPEN ↗</i>
    </button>`).join("");
}

async function runSearch() {
  const query = queryInput.value.trim();
  if (!query) return queryInput.focus();
  const view = activeView;
  if (view === "pngsources") {
    const imageSite = document.getElementById("image-site-view");
    const target = `https://www.google.com/search?tbm=isch&safe=active&q=${encodeURIComponent(query)}`;
    showSection("png");
    imageSite.loadURL?.(target);
    $("#result-count").textContent = `Google Images · ${query}`;
    return;
  }
  const key = view === "pngsources" ? `${view}:${imageMode}:${query.toLowerCase()}` : `${view}:${query.toLowerCase()}`;
  if (resultCache.has(key)) return renderCached(view, resultCache.get(key));
  const generation = ++searchGeneration;
  searchButton.disabled = true;
  searchButton.textContent = "WAIT";
  showMessage();
  try {
    if (view === "youtube") {
      renderSkeleton($("#youtube-results"));
      showSection("youtube");
      const data = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=youtube`).then(parseResponse);
      if (generation !== searchGeneration || activeView !== view) return;
      resultCache.set(key, data);
      renderCached(view, data);
    } else if (view === "online") {
      renderSkeleton($("#online-results"));
      showSection("online");
      const providers = ["mixkit", "archive", "commons", "openverse"];
      const byProvider = new Map();
      await Promise.all(providers.map(async provider => {
        try {
          const part = await fetch(`/api/online-sfx?q=${encodeURIComponent(query)}&source=${provider}`).then(parseResponse);
          byProvider.set(provider, part.results || []);
          if (generation !== searchGeneration || activeView !== view) return;
          const progressive = rankSfxResults(interleaveProviderResults(providers, byProvider), query);
          renderCached(view, { results: progressive });
          $("#result-count").textContent = `${progressive.length} sounds · ${byProvider.size}/${providers.length} sources`;
        } catch { byProvider.set(provider, []); }
      }));
      if (generation !== searchGeneration || activeView !== view) return;
      const data = { results: rankSfxResults(interleaveProviderResults(providers, byProvider), query) };
      resultCache.set(key, data);
      renderCached(view, data);
    } else if (view === "sources") {
      const data = await fetch(`/api/search?q=${encodeURIComponent(query)}&source=libraries`).then(parseResponse);
      if (generation !== searchGeneration || activeView !== view) return;
      resultCache.set(key, data);
      renderCached(view, data);
    } else if (view === "pngsources") {
      renderSkeleton($("#png-results"), 12, true);
      showSection("png");
      let data = [];
      const merge = incoming => {
        if (generation !== searchGeneration || activeView !== view) return;
        data = [...data, ...incoming].filter((item,index,all)=>all.findIndex(other=>(other.originalUrl||other.thumbnail)===(item.originalUrl||item.thumbnail))===index)
          .sort((a,b)=>(a.provider === "Google" ? 0 : 1) - (b.provider === "Google" ? 0 : 1)).slice(0,60);
        resultCache.set(key,data); renderCached(view,data);
      };
      const googlePromise = window.desktop?.searchGoogleImages ? window.desktop.searchGoogleImages(query,imageMode).then(items=>merge(items.map(item=>({...item,provider:"Google",license:"Web result · verify usage rights",transparent:imageMode==="transparent"})))).catch(()=>{}) : Promise.resolve();
      const commonsPromise = fetch(`/api/image-search?q=${encodeURIComponent(query)}&mode=${imageMode}`).then(parseResponse).then(response=>merge(response.results||[])).catch(()=>{});
      await Promise.allSettled([googlePromise,commonsPromise]);
    } else {
      renderLibrary();
    }
  } catch (error) {
    if (generation !== searchGeneration) return;
    showSection("", false);
    showMessage(error.message);
    $("#result-count").textContent = "Search failed";
  } finally {
    if (generation === searchGeneration) {
      searchButton.disabled = false;
      searchButton.textContent = "SEARCH";
    }
  }
}

async function parseResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function assetCard(asset) {
  let preview;
  if (asset.kind === "image") preview = `<div class="asset-image checker"><img src="${assetUrl(asset.id)}" alt="" loading="lazy" draggable="false"></div>`;
  else if (asset.kind === "video") preview = `<div class="asset-image video-thumb"><video src="${assetUrl(asset.id)}" preload="metadata" muted></video><span>VIDEO</span></div>`;
  else preview = `<div class="asset-audio"><button class="play" data-preview="${assetUrl(asset.id)}" data-title="${escapeHtml(asset.name)}" data-source="${escapeHtml(asset.category)}">▶</button><div class="wave-mini"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  const resolution = asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—";
  return `
    <article class="asset-card draggable" draggable="true" data-asset-id="${asset.id}">
      ${preview}
      <div class="asset-copy"><h3>${escapeHtml(asset.name)}</h3><p class="asset-category">${iconSvg(categoryIcon(asset.category))}<span>${escapeHtml(asset.category)} · ${escapeHtml(asset.extension.toUpperCase())}${asset.duration ? ` · ${time(asset.duration)}` : ""}</span></p><small class="asset-tags">${escapeHtml(asset.tags.join(" · ") || "No tags")}</small><div class="asset-detail"><span>${bytes(asset.size)}</span><span>${resolution}</span><span>${escapeHtml(asset.source)}</span></div><small class="asset-location" title="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</small></div>
      <button class="favorite ${asset.favorite ? "active" : ""}" data-favorite="${asset.id}" title="Favorite">★</button>
    </article>`;
}

async function renderLibrary() {
  const query = queryInput.value.trim().toLowerCase();
  const category = $("#category-filter").value;
  const favoritesOnly = $("#favorites-filter").checked || activeKind === "favorite";
  const kind = ["audio", "image", "video"].includes(activeKind) ? activeKind : undefined;
  const filterKey = `${query}|${category}|${favoritesOnly}|${kind || "all"}`;
  if (filterKey !== libraryFilterKey) { libraryFilterKey = filterKey; libraryPage = 0; }
  const serial = ++libraryRenderSerial;
  const limit = query ? 200 : 300;
  let source = assets;
  if (window.desktop?.enabled) {
    const options = { kind, favorite: favoritesOnly, category: category || undefined, limit, offset: libraryPage * limit };
    source = query ? await window.desktop.searchLibrary(query, options) : await window.desktop.listLibrary(options);
    if (serial !== libraryRenderSerial) return;
  }
  const filtered = source.filter(asset => {
    if (activeKind === "audio" && asset.kind !== "audio") return false;
    if (activeKind === "image" && asset.kind !== "image") return false;
    if (activeKind === "video" && asset.kind !== "video") return false;
    if (favoritesOnly && !asset.favorite) return false;
    if (category && asset.category !== category) return false;
    const haystack = [asset.name, asset.category, asset.extension, ...asset.tags].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });
  const grid = $("#asset-grid");
  grid.dataset.viewMode = viewMode;
  grid.innerHTML = filtered.map(assetCard).join("") || '<div class="no-assets">No matching assets. Import files or a folder.</div>';
  $$(".view-switcher button").forEach(button => button.classList.toggle("active", button.dataset.mode === viewMode));
  const total = window.desktop?.enabled ? Number($("#library-count").textContent || assets.length) : assets.length;
  $("#library-summary").textContent = `${filtered.length} shown · ${total} indexed`;
  $("#library-page").textContent = `PAGE ${libraryPage + 1}`;
  $("#library-prev").disabled = libraryPage === 0;
  $("#library-next").disabled = filtered.length < limit;
  $("#library-heading").textContent = activeKind === "favorite" ? "Favorites" : activeKind === "all" ? "All Assets" : activeKind[0].toUpperCase() + activeKind.slice(1);
  $$("[data-library-category]").forEach(button => button.classList.toggle("active", button.dataset.libraryCategory === category));
  showSection("library");
  $("#result-count").textContent = `${filtered.length} library assets · ${viewMode} view`;
}

$("#library-prev").addEventListener("click", () => { libraryPage = Math.max(0, libraryPage - 1); renderLibrary(); });
$("#library-next").addEventListener("click", () => { libraryPage++; renderLibrary(); });

function selectView(view, kind = "all") {
  searchGeneration++;
  activeView = view;
  activeKind = kind;
  window.dispatchEvent(new CustomEvent("media-gecko:view", { detail: { view, kind } }));
  if (uiSettings.rememberLastTab) {
    uiSettings.lastTab = view === "library" ? `library:${kind}` : view;
    saveUiSettings(false);
  }
  $$(".nav").forEach(button => button.classList.toggle("active", button.dataset.view === view && (view !== "library" || button.dataset.kind === kind)));
  const settings = views[view];
  $("#view-title").textContent = settings[0];
  $("#view-subtitle").textContent = settings[1];
  $("#format").textContent = settings[2];
  queryInput.placeholder = settings[3];
  form.hidden = ["search", "projects", "browser", "downloader", "settings", "native"].includes(view);
  $("#library-tools").hidden = view !== "library";
  $("#inspector").hidden = true;
  $("#image-preview").hidden = true;
  showSection("", false);
  $("#result-count").textContent = "Ready";
  if (view === "pngsources") {
    showSection("png");
    $("#result-count").textContent = "Google Images · dedicated workspace";
    return;
  }
  if (view === "browser") {
    showSection("browser");
    $("#result-count").textContent = "Browser downloads auto-index into library";
    return;
  }
  if (view === "downloader") {
    showSection("downloader");
    $("#result-count").textContent = "Paste URL · analyze · download";
    return;
  }
  if (view === "settings") {
    showSection("settings");
    loadCacheStatus();
    return;
  }
  if (view === "native") {
    showSection("native");
    window.mediaGeckoNativeSfx?.activate();
    $("#result-count").textContent = "Native SFX · offline core pack";
    return;
  }
  if (view === "search") {
    showSection("search");
    window.mediaGeckoHub?.renderRecent();
    $("#result-count").textContent = "Universal Search · Ctrl K";
    return;
  }
  if (view === "projects") {
    showSection("projects");
    window.mediaGeckoHub?.renderProjects();
    $("#result-count").textContent = "Projects · autosaved";
    return;
  }
  if (view === "library") return renderLibrary();
  const query = queryInput.value.trim();
  const cacheKey = view === "pngsources" ? `${view}:${imageMode}:${query.toLowerCase()}` : `${view}:${query.toLowerCase()}`;
  const cached = resultCache.get(cacheKey);
  if (query && cached) renderCached(view, cached);
  else if (query) runSearch();
}

function playPreview(url, title, source) {
  const same = audio.src && audio.src === new URL(url, location.href).href;
  if (same && !audio.paused) return audio.pause();
  if (!same) {
    audio.src = url;
    $("#audio-title").textContent = title;
    $("#audio-source").textContent = source;
    seek.value = 0;
  }
  audioDeck.hidden = false;
  audioDeck.classList.add("loading");
  audio.preload = "auto";
  audio.play().catch(() => {
    audioDeck.classList.remove("loading");
    showMessage("Preview could not start. Try again.");
  });
}

async function cacheOnline(row, silent = false) {
  if (row.dataset.assetId || row.dataset.loading) return;
  row.dataset.loading = "true";
  row.classList.add("saving");
  const button = row.querySelector(".cache");
  button.textContent = "PREPARING";
  try {
    const data = await fetch("/api/cache-online", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: row.dataset.onlineUrl, title: row.dataset.onlineTitle, source: row.dataset.onlineSource, jobId: window.mediaGeckoHub?.startDownload(row.dataset.onlineTitle) }),
    }).then(parseResponse);
    row.dataset.assetId = data.asset.id;
    for (const cachedData of resultCache.values()) {
      const item = cachedData?.results?.find?.(result => result.url === row.dataset.onlineUrl);
      if (item) item.assetId = data.asset.id;
    }
    row.draggable = true;
    row.classList.add("drag-ready", "draggable");
    button.textContent = "DRAG";
    await loadLibrary();
  } catch (error) {
    button.textContent = "RETRY";
    if (!silent) showMessage(error.message);
  } finally {
    delete row.dataset.loading;
    row.classList.remove("saving");
  }
}

async function resolveRemoteImage(card) {
  const item = imageResults.find(result => String(result.index) === card.dataset.imageIndex);
  if (!item) throw new Error("Image result expired.");
  if (item.originalUrl) return { url: item.originalUrl, width: item.width, height: item.height, title: item.title };
  if (!card.dataset.originalUrl) {
    const resolved = await window.desktop.resolveGoogleImage(queryInput.value.trim(), imageMode, item.index, item.thumbnail);
    card.dataset.originalUrl = resolved.url || item.thumbnail;
    card.dataset.originalWidth = resolved.width || item.width || 0;
    card.dataset.originalHeight = resolved.height || item.height || 0;
    if (resolved.sourceUrl) item.sourceUrl = resolved.sourceUrl;
  }
  return { url: card.dataset.originalUrl, width: Number(card.dataset.originalWidth), height: Number(card.dataset.originalHeight), title: item.title };
}

async function prepareRemoteImage(card, original = false) {
  const idKey = original ? "originalAssetId" : "assetId";
  if (card.dataset[idKey]) return card.dataset[idKey];
  if (card.dataset.imageLoading) return null;
  card.dataset.imageLoading = "true";
  card.classList.add("saving");
  const button = card.querySelector(".prepare-image");
  button.textContent = "WAIT";
  try {
    const item = imageResults.find(result => String(result.index) === card.dataset.imageIndex);
    const resolved = original ? await resolveRemoteImage(card) : { url: item.thumbnail, title: item.title };
    const asset = await window.desktop.cacheRemoteImage(resolved.url, resolved.title);
    card.dataset[idKey] = asset.id;
    card.dataset.assetId = asset.id;
    for (const cachedData of resultCache.values()) {
      if (!Array.isArray(cachedData)) continue;
      const item = cachedData.find(result => result.thumbnail === card.dataset.thumbnail);
      if (item) item.assetId = asset.id;
    }
    card.draggable = true;
    card.classList.add("draggable", "drag-ready");
    button.textContent = "READY";
    await loadLibrary();
    return asset.id;
  } catch (error) {
    button.textContent = "RETRY";
    showMessage(error.message);
    return null;
  } finally {
    delete card.dataset.imageLoading;
    card.classList.remove("saving");
  }
}

async function openRemotePreview(card) {
  const item = imageResults.find(result => String(result.index) === card.dataset.imageIndex);
  if (!item) return;
  remoteSelected = { card, item };
  const preview = $("#remote-large-preview");
  preview.innerHTML = `<img src="${escapeHtml(item.thumbnail)}" alt="" draggable="false"><span class="preview-spinner">HD</span>`;
  $("#remote-image-title").textContent = item.title;
  $("#remote-image-meta").textContent = `${item.width} × ${item.height} · loading larger preview`;
  $("#image-preview").hidden = false;
  try {
    const resolved = await resolveRemoteImage(card);
    if (remoteSelected?.card !== card) return;
    preview.querySelector("img").src = resolved.url;
    preview.querySelector(".preview-spinner")?.remove();
    $("#remote-image-meta").textContent = `${resolved.width || item.width} × ${resolved.height || item.height} · Google image result`;
  } catch {
    preview.querySelector(".preview-spinner")?.remove();
    $("#remote-image-meta").textContent = `${item.width} × ${item.height} · thumbnail preview`;
  }
}

document.addEventListener("click", async event => {
  const browserLink = event.target.closest("[data-browser-url]");
  if (browserLink) {
    selectView("browser");
    navigateBrowser(browserLink.dataset.browserUrl);
    return;
  }
  const videoPreview = event.target.closest("[data-video-preview]");
  if (videoPreview) {
    const player = $("#video");
    $("#video-title").textContent = videoPreview.dataset.title || "Video preview";
    $("#video-source").textContent = "Preparing 480p preview…";
    $("#video-preview").hidden = false;
    player.src = videoPreview.dataset.videoPreview;
    player.play().catch(() => showMessage("Video preview could not start."));
    return;
  }
  const play = event.target.closest("[data-preview]");
  if (play) {
    const row = play.closest(".online-row");
    if (row) recentlyUsed.set(row.dataset.onlineUrl, Date.now());
    return playPreview(play.dataset.preview, play.dataset.title, play.dataset.source);
  }

  const download = event.target.closest(".download");
  if (download) {
    const row = download.closest(".youtube-row");
    if (row.dataset.assetId) return window.desktop?.revealFile(row.dataset.assetId);
    const format = row.querySelector(".format-select").value;
    const quality = row.querySelector(".quality-select").value;
    download.disabled = true;
    download.textContent = "SAVING";
    row.classList.add("saving");
    try {
      const data = await fetch("/api/download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: download.dataset.url, format, quality, jobId: window.mediaGeckoHub?.startDownload(`YouTube ${format.toUpperCase()}`) }),
      }).then(parseResponse);
      row.dataset.assetId = data.asset.id;
      row.draggable = true;
      row.classList.add("drag-ready", "draggable");
      row.querySelector(".media-info small").textContent = "Ready. Drag this entire row into your editor.";
      download.textContent = "SHOW FILE";
      await loadLibrary();
      showMessage(`${format.toUpperCase()} ready. Drag highlighted row.`);
    } catch (error) {
      download.textContent = "DOWNLOAD";
      showMessage(error.message);
    } finally {
      download.disabled = false;
      row.classList.remove("saving");
    }
    return;
  }

  const sfxFavorite = event.target.closest(".sfx-favorite");
  if (sfxFavorite) {
    const row = sfxFavorite.closest(".online-row");
    const url = row.dataset.onlineUrl;
    if (sfxFavorites.has(url)) sfxFavorites.delete(url); else sfxFavorites.add(url);
    localStorage.setItem("media-gecko-sfx-favorites", JSON.stringify([...sfxFavorites]));
    renderOnlineResults();
    return;
  }

  const sfxDownload = event.target.closest(".sfx-download");
  if (sfxDownload) {
    const row = sfxDownload.closest(".online-row");
    sfxDownload.disabled = true;
    sfxDownload.textContent = "SAVING";
    try {
      const data = await fetch("/api/download-online", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.dataset.onlineUrl, title: row.dataset.onlineTitle, source: row.dataset.onlineSource, jobId: window.mediaGeckoHub?.startDownload(row.dataset.onlineTitle) }),
      }).then(parseResponse);
      row.dataset.assetId = data.asset.id;
      row.draggable = true;
      row.classList.add("drag-ready", "draggable");
      row.querySelector(".cache").textContent = "DRAG";
      sfxDownload.textContent = "SHOW FILE";
      await loadLibrary();
      showMessage("Sound downloaded. Drag row or open file.");
    } catch (error) {
      sfxDownload.textContent = "RETRY";
      showMessage(error.message);
    } finally { sfxDownload.disabled = false; }
    return;
  }

  const cache = event.target.closest(".cache");
  if (cache) return cacheOnline(cache.closest(".online-row"));

  const prepareImage = event.target.closest(".prepare-image");
  if (prepareImage) return prepareRemoteImage(prepareImage.closest(".image-result"), true);

  const remoteImage = event.target.closest(".image-result");
  if (remoteImage) return openRemotePreview(remoteImage);

  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    const asset = assets.find(item => item.id === favorite.dataset.favorite);
    if (!asset || !window.desktop) return;
    await window.desktop.updateAsset(asset.id, { favorite: !asset.favorite });
    await loadLibrary();
    return;
  }

  const card = event.target.closest(".asset-card");
  if (card) openInspector(card.dataset.assetId);
});

document.addEventListener("change", event => {
  if (event.target.matches(".format-select")) {
    event.target.closest(".youtube-row").querySelector(".quality-select").hidden = event.target.value !== "mp4";
  }
});

document.addEventListener("dragstart", event => {
  if (event.target.closest?.(".nav[data-nav-key], [data-category-drag], .layout-item")) return;
  const draggable = event.target.closest?.(".draggable[data-asset-id]");
  if (!draggable || !window.desktop?.enabled) {
    event.preventDefault();
    const remote = event.target.closest?.(".image-result");
    if (remote) {
      prepareRemoteImage(remote, true);
      showMessage("Preparing image. Drag again when card highlights.");
    }
    const online = event.target.closest?.(".online-row");
    if (online) {
      cacheOnline(online);
      showMessage("Preparing sound. Drag again when row highlights.");
    }
    return;
  }
  event.preventDefault();
  window.desktop.startDrag(draggable.dataset.assetId);
});

function openInspector(id) {
  selectedAsset = assets.find(asset => asset.id === id);
  if (!selectedAsset) return;
  const preview = $("#large-preview");
  preview.className = "large-preview " + (selectedAsset.kind === "image" ? "checker" : selectedAsset.kind === "audio" ? "audio-large" : "video-large");
  if (selectedAsset.kind === "image") preview.innerHTML = `<img src="${assetUrl(id)}" alt="">`;
  else if (selectedAsset.kind === "video") preview.innerHTML = `<video src="${assetUrl(id)}" controls preload="metadata"></video>`;
  else preview.innerHTML = `<button class="play" data-preview="${assetUrl(id)}" data-title="${escapeHtml(selectedAsset.name)}" data-source="${escapeHtml(selectedAsset.category)}">▶</button><span>Audio preview</span>`;
  $("#edit-name").value = selectedAsset.name;
  $("#edit-category").innerHTML = categories.map(category => `<option ${category === selectedAsset.category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("");
  $("#edit-tags").value = selectedAsset.tags.join(", ");
  $("#edit-favorite").checked = selectedAsset.favorite;
  $("#inspector").hidden = false;
}

$("#save-asset").addEventListener("click", async () => {
  if (!selectedAsset || !window.desktop) return;
  await window.desktop.updateAsset(selectedAsset.id, {
    name: $("#edit-name").value,
    category: $("#edit-category").value,
    tags: $("#edit-tags").value.split(",").map(tag => tag.trim()),
    favorite: $("#edit-favorite").checked,
  });
  $("#inspector").hidden = true;
  await loadLibrary();
  showMessage("Asset updated.");
});
$("#reveal-asset").addEventListener("click", () => selectedAsset && window.desktop?.revealFile(selectedAsset.id));
$("#remove-asset").addEventListener("click", async () => {
  if (!selectedAsset || !window.desktop) return;
  if (uiSettings.confirmDelete && !confirm("Remove this asset from the Media Gecko index? The original file will stay untouched.")) return;
  await window.desktop.removeAsset(selectedAsset.id);
  $("#inspector").hidden = true;
  await loadLibrary();
  showMessage("Removed from index. Original file kept.");
});
$("#close-inspector").addEventListener("click", () => $("#inspector").hidden = true);
$("#close-image-preview").addEventListener("click", () => { $("#image-preview").hidden = true; remoteSelected = null; });
$("#close-video").addEventListener("click", () => {
  const player = $("#video");
  player.pause();
  player.removeAttribute("src");
  $("#video-preview").hidden = true;
});
$("#video").addEventListener("canplay", () => $("#video-source").textContent = "YouTube · cached 480p preview");
$("#video").addEventListener("waiting", () => $("#video-source").textContent = "Buffering preview…");
$("#save-remote-image").addEventListener("click", async () => {
  if (!remoteSelected) return;
  const id = await prepareRemoteImage(remoteSelected.card, true);
  if (id) {
    showMessage("Original saved and indexed.");
    window.desktop?.revealFile(id);
  }
});
$("#favorite-remote-image").addEventListener("click", async () => { if(!remoteSelected)return; const id=await prepareRemoteImage(remoteSelected.card,false); if(id){await window.desktop.updateAsset(id,{favorite:true});await loadLibrary();showMessage("Image saved to Favorites.");} });
$("#copy-remote-image").addEventListener("click", async () => { if(!remoteSelected)return; const resolved=await resolveRemoteImage(remoteSelected.card); await window.desktop.copyRemoteImage(resolved.url,remoteSelected.item.title); showMessage("Image copied."); });
$("#copy-remote-url").addEventListener("click", async () => { const url=remoteSelected?.item.sourceUrl; if(url){await window.desktop.copyText(url);showMessage("Source URL copied.");} });
$("#open-remote-source").addEventListener("click", () => {
  const url = remoteSelected?.item.sourceUrl;
  if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
});

audio.addEventListener("loadstart", () => audioDeck.classList.add("loading"));
audio.addEventListener("canplay", () => audioDeck.classList.remove("loading"));
audio.addEventListener("playing", () => audioDeck.classList.remove("loading"));
audio.addEventListener("waiting", () => audioDeck.classList.add("loading"));
audio.addEventListener("play", () => $("#play-pause").textContent = "Ⅱ");
audio.addEventListener("pause", () => $("#play-pause").textContent = "▶");
audio.addEventListener("timeupdate", () => {
  $("#current-time").textContent = time(audio.currentTime);
  seek.value = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
});
audio.addEventListener("loadedmetadata", () => $("#duration").textContent = time(audio.duration));
audio.addEventListener("ended", () => $("#play-pause").textContent = "▶");
$("#play-pause").addEventListener("click", () => audio.paused ? audio.play() : audio.pause());
seek.addEventListener("input", () => { if (audio.duration) audio.currentTime = Number(seek.value) / 1000 * audio.duration; });
$("#volume").addEventListener("input", event => {
  audio.volume = Number(event.target.value);
  uiSettings.previewVolume = audio.volume;
  saveUiSettings(false);
  const setting = $("#setting-preview-volume"); if (setting) setting.value = String(audio.volume);
});
$("#close-audio").addEventListener("click", () => { audio.pause(); audio.removeAttribute("src"); audioDeck.hidden = true; });
audio.volume = 0.8;

form.addEventListener("submit", event => { event.preventDefault(); activeView === "library" ? renderLibrary() : runSearch(); });
queryInput.addEventListener("input", () => { if (activeView === "library") renderLibrary(); });
$("#clear").addEventListener("click", () => { queryInput.value = ""; queryInput.focus(); if (activeView === "library") renderLibrary(); });
$("#category-filter").addEventListener("change", renderLibrary);
$("#favorites-filter").addEventListener("change", renderLibrary);
$("#category-chips").addEventListener("click", event => {
  const button = event.target.closest("[data-library-category]");
  if (!button) return;
  $("#category-filter").value = button.dataset.libraryCategory;
  renderLibrary();
});
for (const id of ["#sfx-duration", "#sfx-category", "#sfx-source", "#sfx-format", "#sfx-channel", "#sfx-quality", "#sfx-favorites", "#sfx-downloaded", "#sfx-recent", "#sfx-sort"]) {
  $(id).addEventListener("change", renderOnlineResults);
}
$$(".view-switcher button").forEach(button => button.addEventListener("click", () => {
  viewMode = button.dataset.mode;
  localStorage.setItem("media-gecko-view", viewMode);
  renderLibrary();
}));
$$("[data-image-mode]").forEach(button => {
  button.classList.toggle("active", button.dataset.imageMode === imageMode);
  button.addEventListener("click", () => {
    imageMode = button.dataset.imageMode;
    localStorage.setItem("media-gecko-image-mode", imageMode);
    $$("[data-image-mode]").forEach(item => item.classList.toggle("active", item === button));
    if (activeView === "pngsources" && queryInput.value.trim()) runSearch();
  });
});
$$('[data-image-filter]').forEach(button => button.addEventListener("click", () => {
  imageFilter = button.dataset.imageFilter === imageFilter ? "all" : button.dataset.imageFilter;
  $$('[data-image-filter]').forEach(item => item.classList.toggle("active", item.dataset.imageFilter === imageFilter));
  if (imageResults.length) renderCached("pngsources", imageResults);
}));
$$(".nav").forEach(button => button.addEventListener("click", () => selectView(button.dataset.view, button.dataset.kind || "all")));
$("#import-files").addEventListener("click", async () => {
  if (!window.desktop) return showMessage("Import requires desktop app.");
  const result = await window.desktop.importFiles();
  await loadLibrary();
  selectView("library", "all");
  showMessage(`${result.added.length} files indexed. Originals unchanged.`);
});
$("#import-folder").addEventListener("click", async () => {
  if (!window.desktop) return showMessage("Import requires desktop app.");
  const result = await window.desktop.importFolder();
  await loadLibrary();
  selectView("library", "all");
  showMessage(`${result.added.length} files indexed. Originals unchanged.`);
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (window.mediaGeckoHub?.openSearch) window.mediaGeckoHub.openSearch();
    else { queryInput.focus(); queryInput.select(); }
  }
  if (event.key === "Escape") {
    $("#inspector").hidden = true;
    $("#image-preview").hidden = true;
  }
  if ((event.ctrlKey || event.metaKey) && /^[1-5]$/.test(event.key)) {
    const shortcuts = { "1": ["youtube"], "2": ["online"], "3": ["pngsources"], "4": ["library", "all"], "5": ["downloader"] };
    event.preventDefault(); selectView(...shortcuts[event.key]);
  }
  if (event.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName || "") && !audioDeck.hidden) {
    event.preventDefault(); audio.paused ? audio.play() : audio.pause();
  }
});

window.desktop?.onDragState?.(state => {
  $("#drag-feedback").hidden = state !== "active";
  document.body.classList.toggle("dragging-file", state === "active");
});

const browserView = $("#browser-view");
const imageSiteView = $("#image-site-view");
$("#image-site-home").addEventListener("click", () => imageSiteView.loadURL("https://images.google.com/"));
$("#image-site-back").addEventListener("click", () => imageSiteView.canGoBack() && imageSiteView.goBack());
$("#image-site-forward").addEventListener("click", () => imageSiteView.canGoForward() && imageSiteView.goForward());
$("#image-site-refresh").addEventListener("click", () => imageSiteView.reload());
imageSiteView.addEventListener("did-start-loading", () => $("#image-site-refresh").classList.add("loading"));
imageSiteView.addEventListener("did-stop-loading", () => $("#image-site-refresh").classList.remove("loading"));
imageSiteView.addEventListener("ipc-message", event => { if (event.channel === "browser-image-status") showMessage(event.args[0] || "Google image ready."); });
let browserTabSequence = 1;
let activeBrowserTab = "tab-1";
const browserTabs = [{ id: activeBrowserTab, title: "Google", url: "https://www.google.com/" }];

function renderBrowserTabs() {
  $("#browser-tabs").innerHTML = browserTabs.map(tab => `<button class="browser-tab ${tab.id === activeBrowserTab ? "active" : ""}" data-browser-tab="${tab.id}" title="${escapeHtml(tab.title)}"><span>${escapeHtml(tab.title)}</span>${browserTabs.length > 1 ? `<i data-close-browser-tab="${tab.id}">×</i>` : ""}</button>`).join("") + '<button id="new-browser-tab" title="New tab">＋</button>';
}

function currentBrowserTab() {
  return browserTabs.find(tab => tab.id === activeBrowserTab);
}

function normalizeBrowserUrl(value) {
  const text = String(value || "").trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function navigateBrowser(value) {
  const url = normalizeBrowserUrl(value);
  currentBrowserTab().url = url;
  $("#browser-url").value = url;
  browserView.src = url;
}

function selectBrowserTab(id) {
  const tab = browserTabs.find(item => item.id === id);
  if (!tab) return;
  activeBrowserTab = id;
  renderBrowserTabs();
  $("#browser-url").value = tab.url;
  browserView.src = tab.url;
}

$("#browser-tabs").addEventListener("click", event => {
  const close = event.target.closest("[data-close-browser-tab]");
  if (close) {
    const index = browserTabs.findIndex(tab => tab.id === close.dataset.closeBrowserTab);
    if (index < 0 || browserTabs.length === 1) return;
    const wasActive = browserTabs[index].id === activeBrowserTab;
    browserTabs.splice(index, 1);
    if (wasActive) selectBrowserTab(browserTabs[Math.max(0, index - 1)].id);
    else renderBrowserTabs();
    return;
  }
  const tab = event.target.closest("[data-browser-tab]");
  if (tab) return selectBrowserTab(tab.dataset.browserTab);
  if (event.target.closest("#new-browser-tab") && browserTabs.length < 6) {
    const id = `tab-${++browserTabSequence}`;
    browserTabs.push({ id, title: "New Tab", url: "https://www.google.com/" });
    selectBrowserTab(id);
  }
});
$("#browser-go").addEventListener("click", () => navigateBrowser($("#browser-url").value));
$("#browser-url").addEventListener("keydown", event => { if (event.key === "Enter") navigateBrowser(event.target.value); });
$("#browser-back").addEventListener("click", () => browserView.canGoBack() && browserView.goBack());
$("#browser-forward").addEventListener("click", () => browserView.canGoForward() && browserView.goForward());
$("#browser-refresh").addEventListener("click", () => browserView.reload());
$("#browser-save").addEventListener("click", () => {
  const url = browserView.getURL();
  if (!/^https?:\/\//i.test(url)) return;
  browserView.downloadURL(url);
  showMessage("Download started. Supported media enters library automatically.");
});
browserView.addEventListener("did-navigate", event => {
  currentBrowserTab().url = event.url;
  $("#browser-url").value = event.url;
});
browserView.addEventListener("page-title-updated", event => {
  currentBrowserTab().title = event.title || "Browser";
  renderBrowserTabs();
});
browserView.addEventListener("did-start-loading", () => $("#browser-refresh").classList.add("loading"));
browserView.addEventListener("did-stop-loading", () => $("#browser-refresh").classList.remove("loading"));
browserView.addEventListener("new-window", event => {
  event.preventDefault();
  if (browserTabs.length >= 6) return navigateBrowser(event.url);
  const id = `tab-${++browserTabSequence}`;
  browserTabs.push({ id, title: "New Tab", url: event.url });
  selectBrowserTab(id);
});
browserView.addEventListener("ipc-message", event => {
  if (event.channel === "browser-image-status") showMessage(event.args[0] || "Browser image ready.");
});
window.desktop?.onBrowserDownload?.(async result => {
  if (!result.ok) return showMessage("Download finished, but format is not supported by library.");
  await loadLibrary();
  showMessage(`${result.asset.name} downloaded and added to library.`);
});
renderBrowserTabs();

async function analyzeMediaUrl() {
  const url = $("#media-url").value.trim();
  if (!url) return $("#media-url").focus();
  delete $("#download-url").dataset.assetId;
  $("#download-url").textContent = "DOWNLOAD";
  const button = $("#analyze-url");
  button.disabled = true;
  button.textContent = "ANALYZING";
  $("#url-status").textContent = "Reading public media metadata…";
  $("#url-result").hidden = true;
  try {
    const data = await fetch("/api/analyze-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).then(parseResponse);
    $("#url-result").dataset.url = data.url;
    $("#url-thumb").src = data.thumbnail || "gecko-sidebar.png";
    $("#url-platform").textContent = data.platform;
    $("#url-title").textContent = data.title;
    $("#url-meta").textContent = [time(data.duration), data.width && data.height ? `${data.width} × ${data.height}` : "Resolution varies", data.fps ? `${data.fps} fps` : "", data.size ? `~${bytes(data.size)}` : ""].filter(Boolean).join(" · ");
    $("#url-quality").textContent = data.qualities?.length ? `Available: ${data.qualities.join(" · ")}` : "Highest available source will be used.";
    $("#url-result").hidden = false;
    $("#url-status").textContent = "Ready to download.";
  } catch (error) {
    $("#url-status").textContent = error.message;
  } finally { button.disabled = false; button.textContent = "ANALYZE"; }
}

$("#analyze-url").addEventListener("click", analyzeMediaUrl);
$("#media-url").addEventListener("keydown", event => { if (event.key === "Enter") analyzeMediaUrl(); });
$("#url-format").addEventListener("change", event => { $("#url-quality").hidden = event.target.value === "mp3"; });
$("#download-url").addEventListener("click", async () => {
  const button = $("#download-url");
  if (button.dataset.assetId) return window.desktop?.revealFile(button.dataset.assetId);
  const url = $("#url-result").dataset.url;
  if (!url) return;
  button.disabled = true;
  button.textContent = "DOWNLOADING";
  $("#url-status").textContent = "Downloading highest available quality…";
  try {
    const format = $("#url-format").value;
    const data = await fetch("/api/download-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, format, quality: $("#url-quality").value, jobId: window.mediaGeckoHub?.startDownload(`Social ${format.toUpperCase()}`) }) }).then(parseResponse);
    await loadLibrary();
    button.textContent = "SHOW FILE";
    button.dataset.assetId = data.asset.id;
    $("#url-status").textContent = `${data.asset.extension.toUpperCase()} ready in library.`;
    showMessage("Download complete. File added to library.");
  } catch (error) {
    button.textContent = "RETRY";
    $("#url-status").textContent = error.message;
  } finally { button.disabled = false; }
});

async function loadCacheStatus() {
  if (!window.desktop?.cacheStatus) return;
  const status = await window.desktop.cacheStatus();
  $("#cache-limit").value = String(status.limit);
  const labels = { preview: "Preview Cache", download: "Download Cache", image: "Image Cache", audio: "Audio Cache" };
  $("#cache-groups").innerHTML = Object.entries(labels).map(([key, label]) => `<div class="cache-row"><div>${iconSvg(key === "image" ? "image" : key === "preview" ? "video" : key === "download" ? "download" : "wave")}<span><b>${label}</b><small>${bytes(status.groups[key] || 0)}</small></span></div><button data-clear-cache="${key}">CLEAR</button></div>`).join("");
  $("#result-count").textContent = `${bytes(status.total)} temporary cache used`;
}

$("#cache-limit").addEventListener("change", async event => {
  await window.desktop?.setCacheLimit(Number(event.target.value));
  loadCacheStatus();
});
$("#cache-groups").addEventListener("click", async event => {
  const button = event.target.closest("[data-clear-cache]");
  if (!button) return;
  button.disabled = true;
  await window.desktop?.clearCache(button.dataset.clearCache);
  await loadLibrary();
  await loadCacheStatus();
  showMessage("Temporary cache cleared. Imported files kept.");
});
$("#clear-all-cache").addEventListener("click", async () => {
  if (!confirm("Clear all temporary caches? Imported local files will remain indexed.")) return;
  await window.desktop?.clearCache("all");
  await loadLibrary();
  await loadCacheStatus();
  showMessage("All temporary caches cleared. Imported files kept.");
});

const navButtons = $$(".nav");
const defaultNavLayout = navButtons.map(button => ({
  key: `${button.dataset.view}:${button.dataset.kind || ""}`,
  group: button.closest(".nav-group")?.dataset.navGroup || "discover",
  hidden: button.dataset.defaultHidden === "true",
}));
navButtons.forEach(button => {
  button.dataset.navKey = `${button.dataset.view}:${button.dataset.kind || ""}`;
  button.draggable = true;
});

function readLayout(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
let navLayout = readLayout("media-gecko-nav-layout", defaultNavLayout);
navLayout = navLayout.filter(item => defaultNavLayout.some(defaultItem => defaultItem.key === item.key));
let categoryLayout = readLayout("media-gecko-category-layout", categories.map(name => ({ name, hidden: false, compact: false })));
let draggedNav = "";
let draggedCategory = "";
let osSettings = {};

function mergeCategoryLayout(values = categories) {
  const existing = new Set(categoryLayout.map(item => item.name));
  for (const name of values) if (!existing.has(name)) categoryLayout.push({ name, hidden: false, compact: false });
}
function saveLayouts() {
  localStorage.setItem("media-gecko-nav-layout", JSON.stringify(navLayout));
  localStorage.setItem("media-gecko-category-layout", JSON.stringify(categoryLayout));
}
function applyNavLayout() {
  const known = new Set(navLayout.map(item => item.key));
  for (const item of defaultNavLayout) if (!known.has(item.key)) navLayout.push({ ...item });
  const settingsItem = navLayout.find(item => item.key === "settings:");
  if (settingsItem) settingsItem.hidden = false;
  for (const item of navLayout) {
    const button = document.querySelector(`.nav[data-nav-key="${CSS.escape(item.key)}"]`);
    const group = document.querySelector(`.nav-group[data-nav-group="${item.group}"]`) || $(".nav-group[data-nav-group=discover]");
    if (!button || !group) continue;
    button.hidden = Boolean(item.hidden);
    group.append(button);
  }
  renderLayoutEditors();
}
function renderCategoryChips(values = categories) {
  mergeCategoryLayout(values);
  const current = $("#category-filter").value;
  const visible = categoryLayout.filter(item => !item.hidden && values.includes(item.name));
  $("#category-filter").innerHTML = '<option value="">All categories</option>' + visible.map(item => `<option ${item.name === current ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  $("#category-chips").innerHTML = `<button type="button" data-library-category="" title="All">${iconSvg("grid")}<span>All</span></button>` + visible.map(item => `<button type="button" draggable="true" data-category-drag="${escapeHtml(item.name)}" data-library-category="${escapeHtml(item.name)}" class="${item.compact ? "compact" : ""}" title="${escapeHtml(item.name)}">${iconSvg(categoryIcon(item.name))}<span>${escapeHtml(item.name)}</span></button>`).join("");
  renderLayoutEditors();
}
function renderLayoutEditors() {
  const navEditor = $("#nav-layout-editor");
  const categoryEditor = $("#category-layout-editor");
  if (!navEditor || !categoryEditor) return;
  const groupLabels = { discover: "Discover", workspace: "Workspace", library: "Library", utilities: "Utilities" };
  navEditor.innerHTML = Object.keys(groupLabels).map(group => `<div class="layout-dropzone" data-layout-group="${group}"><b>${groupLabels[group]}</b>${navLayout.filter(item => item.group === group).map(item => {
    const button = document.querySelector(`.nav[data-nav-key="${CSS.escape(item.key)}"]`);
    return `<div class="layout-item ${item.hidden ? "is-hidden" : ""}" draggable="true" data-nav-layout="${escapeHtml(item.key)}"><span class="grip">⠿</span><span>${escapeHtml(button?.querySelector("span")?.textContent || item.key)}</span><small>${item.hidden ? "HIDDEN" : "VISIBLE"}</small><button data-layout-action="hide-nav" title="Show or hide tab" ${item.key === "settings:" ? "disabled" : ""}>${item.hidden ? "○" : "●"}</button></div>`;
  }).join("")}</div>`).join("");
  categoryEditor.innerHTML = categoryLayout.map(item => `<div class="layout-item" draggable="true" data-category-layout="${escapeHtml(item.name)}"><span class="grip">⠿</span>${iconSvg(categoryIcon(item.name))}<span>${escapeHtml(item.name)}</span><button data-layout-action="compact-category" title="Compact">${item.compact ? "ICON" : "TEXT"}</button><button data-layout-action="hide-category" title="Show or hide">${item.hidden ? "○" : "●"}</button></div>`).join("");
}

document.addEventListener("dragstart", event => {
  const nav = event.target.closest?.("[data-nav-key], [data-nav-layout]");
  const category = event.target.closest?.("[data-category-drag], [data-category-layout]");
  if (nav) { draggedNav = nav.dataset.navKey || nav.dataset.navLayout; event.dataTransfer.effectAllowed = "move"; }
  if (category) { draggedCategory = category.dataset.categoryDrag || category.dataset.categoryLayout; event.dataTransfer.effectAllowed = "move"; }
});
document.addEventListener("dragover", event => {
  if (draggedNav && event.target.closest?.(".nav-group,.layout-dropzone,[data-nav-layout]")) event.preventDefault();
  if (draggedCategory && event.target.closest?.("#category-chips,#category-layout-editor,[data-category-drag],[data-category-layout]")) event.preventDefault();
});
document.addEventListener("drop", event => {
  if (draggedNav) {
    const targetItem = event.target.closest?.("[data-nav-key],[data-nav-layout]");
    const targetGroup = event.target.closest?.("[data-nav-group],[data-layout-group]");
    if (targetItem || targetGroup) {
      event.preventDefault();
      const moving = navLayout.find(item => item.key === draggedNav);
      const targetKey = targetItem?.dataset.navKey || targetItem?.dataset.navLayout;
      const group = targetGroup?.dataset.navGroup || targetGroup?.dataset.layoutGroup || navLayout.find(item => item.key === targetKey)?.group;
      navLayout = navLayout.filter(item => item.key !== draggedNav);
      moving.group = group || moving.group;
      const index = targetKey ? navLayout.findIndex(item => item.key === targetKey) : -1;
      navLayout.splice(index < 0 ? navLayout.length : index, 0, moving);
      saveLayouts(); applyNavLayout();
    }
  }
  if (draggedCategory) {
    const target = event.target.closest?.("[data-category-drag],[data-category-layout]");
    if (target) {
      event.preventDefault();
      const targetName = target.dataset.categoryDrag || target.dataset.categoryLayout;
      const moving = categoryLayout.find(item => item.name === draggedCategory);
      categoryLayout = categoryLayout.filter(item => item.name !== draggedCategory);
      const index = categoryLayout.findIndex(item => item.name === targetName);
      categoryLayout.splice(index < 0 ? categoryLayout.length : index, 0, moving);
      saveLayouts(); renderCategoryChips([...categories, ...assets.map(asset => asset.category)]);
    }
  }
  draggedNav = ""; draggedCategory = "";
});
document.addEventListener("dragend", () => { draggedNav = ""; draggedCategory = ""; });

$("#nav-layout-editor").addEventListener("click", event => {
  const action = event.target.closest("[data-layout-action=hide-nav]");
  if (!action) return;
  const key = action.closest("[data-nav-layout]").dataset.navLayout;
  const item = navLayout.find(value => value.key === key);
  item.hidden = !item.hidden; saveLayouts(); applyNavLayout();
});
$("#category-layout-editor").addEventListener("click", event => {
  const action = event.target.closest("[data-layout-action]");
  if (!action) return;
  const name = action.closest("[data-category-layout]").dataset.categoryLayout;
  const item = categoryLayout.find(value => value.name === name);
  if (action.dataset.layoutAction === "hide-category") item.hidden = !item.hidden;
  if (action.dataset.layoutAction === "compact-category") item.compact = !item.compact;
  saveLayouts(); renderCategoryChips([...categories, ...assets.map(asset => asset.category)]);
});
$("#reset-layout").addEventListener("click", () => {
  navLayout = structuredClone(defaultNavLayout);
  categoryLayout = categories.map(name => ({ name, hidden: false, compact: false }));
  saveLayouts(); applyNavLayout(); renderCategoryChips([...categories, ...assets.map(asset => asset.category)]);
  showMessage("Default layout restored.");
});
function showAllWorkspaceFeatures(message = "All tabs restored.") {
  navLayout.forEach(item => { item.hidden = false; });
  categoryLayout.forEach(item => { item.hidden = false; });
  saveLayouts(); applyNavLayout(); renderCategoryChips([...categories, ...assets.map(asset => asset.category)]);
  showMessage(message);
}
$("#restore-all-tabs").addEventListener("click", () => showAllWorkspaceFeatures());
$("#show-everything").addEventListener("click", () => showAllWorkspaceFeatures("Everything is visible."));

function cssColorHex(value) {
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = String(value || "");
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const channels = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  probe.remove();
  if (!channels || channels.length !== 3) return null;
  return `#${channels.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}
function mixHex(base, target, targetWeight) {
  const a = cssColorHex(base), b = cssColorHex(target);
  if (!a || !b) return base;
  const ratio = Math.max(0, Math.min(1, Number(targetWeight)));
  const channel = index => Math.round(parseInt(a.slice(index, index + 2), 16) * (1 - ratio) + parseInt(b.slice(index, index + 2), 16) * ratio);
  return `#${[1, 3, 5].map(index => channel(index).toString(16).padStart(2, "0")).join("")}`;
}
function buildAccentPalette(value, appearance = "dark") {
  const primary = cssColorHex(value) || uiSettings.colors.primary;
  const light = appearance === "light";
  return {
    primary,
    secondary: mixHex(primary, "#000000", light ? 0.18 : 0.25),
    icon: mixHex(primary, light ? "#101010" : "#ffffff", light ? 0.12 : 0.40),
    selection: mixHex(primary, light ? "#ffffff" : "#202020", light ? 0.82 : 0.72),
    glow: primary,
    button: mixHex(primary, light ? "#000000" : "#202020", light ? 0.12 : 0.55),
    progress: mixHex(primary, "#ffffff", light ? 0.02 : 0.06),
    waveform: mixHex(primary, "#ffffff", light ? 0.10 : 0.20),
  };
}

function saveUiSettings(sync = true) {
  localStorage.setItem("media-gecko-settings", JSON.stringify(uiSettings));
  applyUiSettings();
  if (sync) window.desktop?.updateAppSettings?.({
    launchMinimized: uiSettings.launchMinimized, startWindows: uiSettings.startWindows, restoreWindow: uiSettings.restoreWindow,
    hardwareAcceleration: uiSettings.hardwareAcceleration, performanceMode: uiSettings.performanceMode, autoCleanup: uiSettings.autoCleanup,
  }).catch(() => {});
}
function applyUiSettings() {
  const root = document.documentElement;
  const colors = uiSettings.colors;
  root.style.setProperty("--orange", colors.primary);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--orange2", colors.secondary);
  root.style.setProperty("--icon-accent", colors.icon);
  root.style.setProperty("--selection", colors.selection);
  root.style.setProperty("--glow", colors.glow);
  root.style.setProperty("--button-accent", colors.button);
  root.style.setProperty("--progress", colors.progress);
  root.style.setProperty("--waveform", colors.waveform);
  document.body.dataset.sidebar = uiSettings.sidebarMode;
  document.body.dataset.autoSidebar = String(uiSettings.autoSidebar);
  document.body.dataset.density = uiSettings.density;
  document.body.dataset.icons = uiSettings.iconSize;
  document.body.dataset.thumbnails = uiSettings.thumbnailSize;
  document.body.dataset.animation = uiSettings.animation;
  document.body.dataset.appearance = uiSettings.appearance || "dark";
  document.body.classList.toggle("reduce-motion", uiSettings.reduceMotion);
  document.body.classList.toggle("performance-mode", uiSettings.performanceMode);
  audio.volume = Number(uiSettings.previewVolume);
  $("#volume").value = String(uiSettings.previewVolume);
  window.desktop?.setThemeAccent?.(colors.primary).catch(() => {});
}
function setSidebarMode(mode) {
  uiSettings.sidebarMode = ["full", "icons", "hidden"].includes(mode) ? mode : "full";
  saveUiSettings();
  const select = $("#setting-sidebar-mode"); if (select) select.value = uiSettings.sidebarMode;
}
$("#sidebar-toggle").addEventListener("click", () => setSidebarMode(uiSettings.sidebarMode === "full" ? "icons" : "full"));

const settingBindings = {
  "setting-startup-tab":"startupTab", "setting-remember-tab":"rememberLastTab", "setting-sidebar-mode":"sidebarMode", "setting-auto-sidebar":"autoSidebar",
  "setting-density":"density", "setting-default-view":"defaultView", "setting-icon-size":"iconSize", "setting-thumbnail-size":"thumbnailSize",
  "setting-preview-volume":"previewVolume", "setting-autoplay":"autoplay", "setting-hover-delay":"hoverDelay", "setting-animation":"animation",
  "setting-reduce-motion":"reduceMotion", "setting-auto-cleanup":"autoCleanup", "setting-launch-minimized":"launchMinimized",
  "setting-start-windows":"startWindows", "setting-restore-window":"restoreWindow", "setting-hardware":"hardwareAcceleration",
  "setting-performance":"performanceMode", "setting-confirm-delete":"confirmDelete",
  "setting-appearance":"appearance",
};
function renderSettings() {
  const tabOptions = [["youtube","YouTube Media"],["online","Free SFX"],["native","Native SFX"],["downloader","Social Downloader"],["pngsources","Image Search"],["browser","Browser"],["library:all","All Assets"],["library:audio","Audio Library"],["library:image","Image Library"],["library:video","Video Library"],["library:favorite","Favorites"]];
  $("#setting-startup-tab").innerHTML = tabOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  for (const [id, key] of Object.entries(settingBindings)) {
    const input = document.getElementById(id); if (!input) continue;
    if (input.type === "checkbox") input.checked = Boolean(uiSettings[key]); else input.value = String(uiSettings[key]);
  }
  $("#theme-presets").innerHTML = Object.entries(themePresets).map(([key, preset]) => `<button data-theme-preset="${key}" class="${uiSettings.theme === key ? "active" : ""}"><i style="--swatch:${preset.colors.primary}"></i><span>${preset.name}</span></button>`).join("");
  const labels = { primary:"Accent color" };
  $("#theme-colors").innerHTML = Object.entries(labels).map(([key, label]) => `<label><span>${label}</span><div><input type="color" data-theme-color="${key}" value="${/^#[0-9a-f]{6}$/i.test(uiSettings.colors[key]) ? uiSettings.colors[key] : "#ffffff"}"><input data-theme-text="${key}" value="${escapeHtml(uiSettings.colors[key])}" spellcheck="false"></div></label>`).join("");
  $("#setting-download-folder").value = osSettings.downloadDir || "";
  $("#setting-library-folder").value = osSettings.libraryDir || "";
  $("#setting-cache-folder").value = osSettings.cacheDir || "";
  window.desktop?.getAppInfo?.().then(info => { $("#about-version").textContent = `Version ${info.version}${info.packaged ? " · Installed build" : " · Development build"}`; }).catch(() => {});
  renderLayoutEditors();
}
$("#settings-section").addEventListener("input", event => {
  const key = settingBindings[event.target.id];
  if (key) {
    uiSettings[key] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "range" ? Number(event.target.value) : event.target.value;
    if (key === "defaultView") { viewMode = uiSettings.defaultView; localStorage.setItem("media-gecko-view", viewMode); }
    if (key === "appearance" && uiSettings.theme === "custom") uiSettings.colors = buildAccentPalette(uiSettings.colors.primary, uiSettings.appearance);
    saveUiSettings();
  }
  const colorKey = event.target.dataset.themeColor || event.target.dataset.themeText;
  if (colorKey) {
    const value = event.target.value.trim();
    if (CSS.supports("color", value)) {
      uiSettings.theme = "custom";
      uiSettings.colors = colorKey === "primary" ? buildAccentPalette(value, uiSettings.appearance) : { ...uiSettings.colors, [colorKey]: value };
      saveUiSettings(false);
      const color = document.querySelector(`[data-theme-color="${colorKey}"]`);
      const text = document.querySelector(`[data-theme-text="${colorKey}"]`);
      if (event.target.dataset.themeColor) text.value = uiSettings.colors[colorKey];
      if (/^#[0-9a-f]{6}$/i.test(uiSettings.colors[colorKey])) color.value = uiSettings.colors[colorKey];
      $$("[data-theme-preset]").forEach(button => button.classList.remove("active"));
    }
  }
});
$("#theme-presets").addEventListener("click", event => {
  const button = event.target.closest("[data-theme-preset]"); if (!button) return;
  const preset = themePresets[button.dataset.themePreset];
  uiSettings.theme = button.dataset.themePreset; uiSettings.colors = { ...preset.colors }; uiSettings.appearance = preset.appearance || "dark"; saveUiSettings(false); renderSettings();
});
$(".folder-settings").addEventListener("click", async event => {
  const button = event.target.closest("[data-folder-setting]"); if (!button || !window.desktop?.chooseFolder) return;
  const result = await window.desktop.chooseFolder(button.dataset.folderSetting);
  if (result) { osSettings = result; renderSettings(); showMessage("Folder saved. Restart app to apply fully."); }
});
$("#reset-settings").addEventListener("click", async () => {
  if (!confirm("Reset all Media Gecko settings and theme? Library files stay untouched.")) return;
  localStorage.removeItem("media-gecko-settings"); localStorage.removeItem("media-gecko-view");
  await window.desktop?.resetAppSettings?.(); location.reload();
});

const hoverPreviewTimers = new WeakMap();
document.addEventListener("pointerenter", event => {
  const row = event.target.closest?.(".online-row");
  if (!row || !uiSettings.autoplay) return;
  const play = row.querySelector("[data-preview]");
  const timer = setTimeout(() => playPreview(play.dataset.preview, play.dataset.title, play.dataset.source), Number(uiSettings.hoverDelay || 300));
  hoverPreviewTimers.set(row, timer);
}, true);
document.addEventListener("pointerleave", event => {
  const row = event.target.closest?.(".online-row");
  if (row && hoverPreviewTimers.has(row)) clearTimeout(hoverPreviewTimers.get(row));
}, true);

async function initApp() {
  try { osSettings = await window.desktop?.getAppSettings?.() || {}; } catch {}
  if (typeof osSettings.launchMinimized === "boolean") uiSettings.launchMinimized = osSettings.launchMinimized;
  if (typeof osSettings.startWindows === "boolean") uiSettings.startWindows = osSettings.startWindows;
  if (typeof osSettings.restoreWindow === "boolean") uiSettings.restoreWindow = osSettings.restoreWindow;
  if (typeof osSettings.hardwareAcceleration === "boolean") uiSettings.hardwareAcceleration = osSettings.hardwareAcceleration;
  if (typeof osSettings.performanceMode === "boolean") uiSettings.performanceMode = osSettings.performanceMode;
  if (typeof osSettings.autoCleanup === "boolean") uiSettings.autoCleanup = osSettings.autoCleanup;
  try { applyUiSettings(); } catch (error) { console.warn("Theme recovery", error); uiSettings = structuredClone(defaultUiSettings); applyUiSettings(); }
  try { applyNavLayout(); renderSettings(); } catch (error) { console.warn("Layout recovery", error); navLayout = structuredClone(defaultNavLayout); saveLayouts(); applyNavLayout(); }
  await Promise.allSettled([Promise.resolve(checkHealth()), Promise.resolve(loadLibrary())]);
  const start = uiSettings.rememberLastTab ? uiSettings.lastTab : uiSettings.startupTab;
  const [view, kind] = String(start || "youtube").split(":");
  selectView(views[view] ? view : "youtube", kind || "all");
}

document.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = iconSvg(element.dataset.icon); });

initApp().catch(error => { console.error("Media Gecko recovered from startup error", error); try { selectView("search"); showMessage("Workspace recovered. Some saved state could not load."); } catch {} });

const compactButton = $("#workspace-compact");
document.body.classList.toggle("workspace-focus", localStorage.getItem("media-gecko-workspace-focus") === "true");
compactButton.addEventListener("click", () => {
  document.body.classList.toggle("workspace-focus");
  localStorage.setItem("media-gecko-workspace-focus", String(document.body.classList.contains("workspace-focus")));
});
