const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const crypto = require("node:crypto");
const { app, BrowserWindow, ipcMain, nativeImage, shell, dialog, session, clipboard, Menu, globalShortcut, safeStorage, screen } = require("electron");
const library = require("./library-store");

app.setName("Media Gecko");
const startupLogFile = path.join(app.getPath("userData"), "media-gecko.log");
function logProblem(scope, error) {
  try {
    fs.mkdirSync(path.dirname(startupLogFile), { recursive: true });
    const message = error?.stack || error?.message || String(error);
    fs.appendFileSync(startupLogFile, `[${new Date().toISOString()}] ${scope}: ${message}\n`);
  } catch {}
}
process.on("uncaughtException", error => logProblem("uncaughtException", error));
process.on("unhandledRejection", error => logProblem("unhandledRejection", error));
const defaultAppSettings = {
  launchMinimized: false, startWindows: false, restoreWindow: true, hardwareAcceleration: true,
  performanceMode: false, autoCleanup: true, windowBounds: null, miniShortcut: "Alt+Space",
};
const appSettingsFile = path.join(app.getPath("userData"), "app-settings.json");
function readAppSettings() {
  try { return { ...defaultAppSettings, ...JSON.parse(fs.readFileSync(appSettingsFile, "utf8")) }; }
  catch { return { ...defaultAppSettings }; }
}
let appSettings = readAppSettings();
if (!appSettings.hardwareAcceleration) app.disableHardwareAcceleration();

function appSettingsView() {
  const userData = app.getPath("userData");
  return {
    ...appSettings,
    downloadDir: appSettings.downloadDir || path.join(app.getPath("downloads"), "Media Gecko"),
    libraryDir: appSettings.libraryDir || path.join(userData, "library"),
    cacheDir: appSettings.cacheDir || path.join(userData, "cache"),
  };
}
function writeAppSettings(changes = {}) {
  const allowed = ["launchMinimized", "startWindows", "restoreWindow", "hardwareAcceleration", "performanceMode", "autoCleanup", "downloadDir", "libraryDir", "cacheDir", "windowBounds", "miniShortcut"];
  for (const key of allowed) if (Object.hasOwn(changes, key)) appSettings[key] = changes[key];
  fs.mkdirSync(path.dirname(appSettingsFile), { recursive: true });
  fs.writeFileSync(appSettingsFile, JSON.stringify(appSettings, null, 2));
  process.env.MEDIA_GECKO_AUTO_CLEANUP = appSettings.autoCleanup === false ? "false" : "true";
  if (app.isReady() && app.isPackaged) app.setLoginItemSettings({ openAtLogin: Boolean(appSettings.startWindows), path: process.execPath });
  return appSettingsView();
}
let mainWindow;
let miniWindow;
let miniPreviewWindow;
let downloadDir;
let toolsDir;
let imageSearchWindow;
let imageSearchQuery = "";
const imageSearchCache = new Map();
let myInstantsWindow;
let myInstantsSerial = Promise.resolve();
const myInstantsCache = new Map();
const browserImageAssets = new Map();
const browserImagePending = new Map();
let imageSearchSerial = Promise.resolve();
let nativeSfxCatalog = [];
const workspaceFile = path.join(app.getPath("userData"), "workspace.json");
let watchedTimers = new Map();
let watchers = [];
function readWorkspace() {
  try { return { projects: [], tray: [], collections: [], rules: [], watchedFolders: [], browserHistory: [], ...JSON.parse(fs.readFileSync(workspaceFile, "utf8")) }; }
  catch { return { projects: [], tray: [], collections: [], rules: [], watchedFolders: [], browserHistory: [] }; }
}
let workspaceState = readWorkspace();
function saveWorkspace() {
  fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
  fs.writeFileSync(workspaceFile, JSON.stringify(workspaceState, null, 2));
}
function projectView(project) { return { ...project, assets: (project.assetIds || []).map(library.get).filter(Boolean) }; }
function trayView() { return workspaceState.tray.map(library.get).filter(Boolean); }
function envatoToken() { try { const encrypted=workspaceState.integrations?.envatoToken; return encrypted && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(encrypted,"base64")) : ""; } catch { return ""; } }
function assistantToken() { try { const encrypted=workspaceState.integrations?.openaiToken; return encrypted && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(encrypted,"base64")) : ""; } catch { return ""; } }
function universalSearch(query) {
  const term = String(query || "").trim().slice(0, 160);
  const lowered = term.toLowerCase();
  const intentTerm = lowered.replace(/^(open|find|search|show|go to)\s+/, "").replace(/\s+(sfx|sound effects?|images?|videos?|pngs?)$/, "").trim() || term;
  const scoreAsset = asset => {
    const name = asset.name.toLowerCase(), category = asset.category.toLowerCase(), tags = asset.tags.join(" ").toLowerCase();
    let score = asset.favorite ? 18 : 0; if (asset.lastUsed) score += 8;
    if (name === lowered) score += 100; else if (name.startsWith(lowered)) score += 65; else if (name.includes(lowered)) score += 38;
    if (category.includes(lowered)) score += 22; if (tags.includes(lowered)) score += 16;
    if (/png|transparent/.test(lowered) && asset.kind === "image" && asset.extension === "png") score += 45;
    if (/sfx|sound|audio/.test(lowered) && asset.kind === "audio") score += 35;
    if (/video/.test(lowered) && asset.kind === "video") score += 35;
    return score;
  };
  const mapAsset = asset => ({
    type: asset.source === "Native SFX" ? "SFX" : asset.source === "youtube" ? "DOWNLOAD" : asset.kind === "image" && asset.extension === "png" ? "PNG" : asset.kind.toUpperCase(),
    label: asset.name, subtitle: `${asset.category} · ${asset.extension.toUpperCase()}${asset.favorite ? " · Favorite" : ""}`, assetId: asset.id, kind: asset.kind,
    previewUrl: `/api/library/file?id=${encodeURIComponent(asset.id)}`, score: scoreAsset(asset), source: asset.source,
  });
  let localAssets = library.search(intentTerm, { limit: 120 });
  if (/\bfavou?rites?\b/.test(lowered)) localAssets = library.smartFolder("favorites", 120);
  else if (/\b(recent|recently used|history)\b/.test(lowered)) localAssets = library.smartFolder("recentUsed", 120);
  else if (/\bdownloads?\b/.test(lowered)) localAssets = library.smartFolder("downloads", 120);
  const local = localAssets.map(mapAsset).sort((a, b) => b.score - a.score).slice(0, 55);
  const projects = workspaceState.projects.filter(project => !project.archived && (!lowered || `${project.name} ${project.notes || ""}`.toLowerCase().includes(lowered))).slice(0, 8).map(project => ({ type: "PROJECT", label: project.name, subtitle: `${project.assetIds?.length || 0} assets`, projectId: project.id, view: "projects" }));
  const history = workspaceState.browserHistory.filter(item => !lowered || `${item.title} ${item.url}`.toLowerCase().includes(lowered)).slice(0, 6).map(item => ({ type: "HISTORY", label: item.title, subtitle: item.url, url: item.url, view: "browser" }));
  const tabs = [
    ["Universal Search","search"],["YouTube Media","youtube"],["Native SFX","native"],["Free SFX Search","online"],["Image Search","pngsources"],["Social Downloader","downloader"],["Browser","browser"],["All Assets","library"],["Projects","projects"],["Integrations","sources"],["Settings","settings"],
  ].filter(([name]) => !lowered || name.toLowerCase().includes(lowered) || lowered.includes(name.toLowerCase().replace(/s$/, ""))).map(([label, view]) => ({ type: "TOOL", label: `Open ${label}`, subtitle: "App feature", view }));
  const commands = [
    { phrases:["clear cache","empty cache"], type:"COMMAND", label:"Clear preview cache", subtitle:"Media Gecko command", command:"clear-cache" },
    { phrases:["open downloads","downloads"], type:"COMMAND", label:"Open download queue", subtitle:"Media Gecko command", command:"open-downloads" },
    { phrases:["open image search","find images","png search"], type:"COMMAND", label:"Open Image Search", subtitle:"Transparent images default", view:"pngsources" },
    { phrases:["open settings","settings"], type:"COMMAND", label:"Open Settings", subtitle:"Customize Media Gecko", view:"settings" },
  ].filter(item => !lowered || item.phrases.some(phrase => phrase.includes(lowered) || lowered.includes(phrase))).map(({ phrases, ...item }) => item);
  const actions = term ? [
    { type: "ONLINE", media:"image", label: `Search images for “${intentTerm}”`, subtitle:"Google-style multi-source search", query: intentTerm, view: "pngsources" },
    { type: "ONLINE", media:"sfx", label: `Find “${intentTerm}” sound effects`, subtitle:"Commons · Mixkit · Archive · Openverse", query: intentTerm, view: "online" },
  ] : [];
  return [...commands, ...local, ...projects, ...history, ...tabs, ...actions].slice(0, 90);
}

function assistantOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data?.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text || "").join("\n").trim();
}

async function askAssistant(messages, project) {
  const token = assistantToken();
  if (!token) throw new Error("Add OpenAI API key in Gecko Assistant first.");
  const history = (Array.isArray(messages) ? messages : []).slice(-12).map(item => ({ role: item?.role === "assistant" ? "assistant" : "user", content: String(item?.content || "").slice(0, 6000) })).filter(item => item.content);
  if (!history.length) throw new Error("Write a message first.");
  const projectText = String(project?.name || "No active project").slice(0, 120);
  const projectNotes = String(project?.notes || "").slice(0, 2500);
  const recentAssets = library.smartFolder("recentUsed", 18).map(asset => `${asset.kind}: ${asset.name} [${asset.category}]`).join("\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: "gpt-5-mini", store: false,
      instructions: `You are Gecko Assistant inside Media Gecko, a focused creative asset app for video editors. Help with current edit project, asset planning, shot ideas, SFX, images, and search terms. Be concise. Use find_assets whenever user asks you to find, pull, search, or suggest usable media. Current project: ${projectText}. Notes: ${projectNotes || "none"}. Recent library assets:\n${recentAssets || "none"}`,
      input: history,
      tools: [
        { type: "web_search" },
        { type: "function", name: "find_assets", description: "Search Media Gecko for visual or audio assets requested by user.", strict: true, parameters: { type: "object", properties: { kind: { type: "string", enum: ["image", "sfx", "video", "local"] }, query: { type: "string" } }, required: ["kind", "query"], additionalProperties: false } },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status}).`);
  const actions = (data.output || []).filter(item => item.type === "function_call" && item.name === "find_assets").map(item => { try { const value = JSON.parse(item.arguments || "{}"); return { kind: value.kind, query: String(value.query || "").slice(0, 160) }; } catch { return null; } }).filter(item => item?.query && ["image","sfx","video","local"].includes(item.kind));
  if (!actions.length) {
    const request = history.at(-1)?.content || "";
    if (/\b(find|search|pull|get|need|asset)\b/i.test(request)) {
      const kind = /\b(sfx|sound|audio)\b/i.test(request) ? "sfx" : /\b(video|footage|clip)\b/i.test(request) ? "video" : /\b(local|library|my files?)\b/i.test(request) ? "local" : /\b(image|photo|png|graphic|picture|reference)\b/i.test(request) ? "image" : "local";
      const query = request.replace(/\b(please|find|search|pull|get|need|me|some|an?|the|asset|assets|image|images|photo|photos|png|graphic|picture|sfx|sound effects?|audio|video|footage|clip|local|library|my files?)\b/gi, " ").replace(/\s+/g, " ").trim();
      if (query) actions.push({ kind, query: query.slice(0, 160) });
    }
  }
  return { text: assistantOutputText(data) || (actions.length ? "I prepared asset searches for this project." : "No text response returned."), actions };
}
const execFileAsync = promisify(execFile);
const iconPng = path.join(__dirname, "assets", "gecko-main.png");
const dragIcon = nativeImage.createFromPath(path.join(__dirname, "assets", "gecko-sidebar.png")).resize({ width: 32, height: 32 });
const singleInstance = app.requestSingleInstanceLock();

function createWindow(port) {
  const storedBounds = appSettings.restoreWindow && appSettings.windowBounds ? appSettings.windowBounds : {};
  mainWindow = new BrowserWindow({
    width: Math.max(560, Number(storedBounds.width || 1080)), height: Math.max(420, Number(storedBounds.height || 760)),
    ...(Number.isFinite(storedBounds.x) && Number.isFinite(storedBounds.y) ? { x: storedBounds.x, y: storedBounds.y } : {}),
    minWidth: 560, minHeight: 420,
    backgroundColor: "#1e1e1e", titleBarStyle: "hidden",
    titleBarOverlay: { color: "#171717", symbolColor: "#bcbcbc", height: 34 },
    show: false, icon: iconPng,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, webviewTag: true },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (appSettings.launchMinimized) mainWindow.minimize();
  });
  mainWindow.on("close", () => {
    if (appSettings.restoreWindow && !mainWindow.isDestroyed()) writeAppSettings({ windowBounds: mainWindow.getNormalBounds() });
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
    if (miniPreviewWindow && !miniPreviewWindow.isDestroyed()) miniPreviewWindow.close();
    if (myInstantsWindow && !myInstantsWindow.isDestroyed()) myInstantsWindow.close();
    app.quit();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-attach-webview", (_event, webPreferences, params) => {
    webPreferences.preload = path.join(__dirname, "webview-preload.js");
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!/^https?:\/\//i.test(params.src || "")) params.src = "https://www.google.com/";
  });
}

function createMiniWindow(port) {
  miniWindow = new BrowserWindow({ width: 560, height: 390, minWidth: 420, minHeight: 260, frame: false, show: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, backgroundColor: "#171717", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  miniWindow.loadURL(`http://127.0.0.1:${port}/mini.html`);
  miniPreviewWindow = new BrowserWindow({ width: 320, height: 320, frame: false, show: false, resizable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, backgroundColor: "#171717", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  miniPreviewWindow.loadURL(`http://127.0.0.1:${port}/mini-preview.html`);
  miniWindow.on("blur", () => { miniWindow?.hide(); miniPreviewWindow?.hide(); });
  miniWindow.on("closed", () => { miniWindow = null; if (miniPreviewWindow && !miniPreviewWindow.isDestroyed()) miniPreviewWindow.close(); });
  miniPreviewWindow.on("closed", () => { miniPreviewWindow = null; });
  const showMini = () => {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    if (miniWindow.isVisible()) { miniWindow.hide(); miniPreviewWindow?.hide(); }
    else { miniWindow.center(); miniWindow.show(); miniWindow.focus(); miniWindow.webContents.send("mini-focus"); }
  };
  const preferred = String(appSettings.miniShortcut || "Alt+Space");
  const active = globalShortcut.register(preferred, showMini) ? preferred : "Alt+Shift+Space";
  if (active !== preferred) globalShortcut.register(active, showMini);
  appSettings.miniShortcutActive = active;
}

function applyCustomRules(items) {
  for (const asset of items) {
    for (const rule of workspaceState.rules) {
      const value = String(rule.value || "").toLowerCase();
      const matches = rule.field === "kind" ? asset.kind === value : rule.field === "extension" ? asset.extension === value.replace(/^\./, "") : rule.field === "name" ? asset.name.toLowerCase().includes(value) : false;
      if (matches && rule.category) library.update(asset.id, { category: String(rule.category).slice(0, 80) });
    }
  }
}
function startWatchedFolders() {
  for (const watcher of watchers) try { watcher.close(); } catch {}
  watchers = [];
  for (const root of workspaceState.watchedFolders) {
    if (!fs.existsSync(root)) continue;
    try {
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        const target = filename ? path.join(root, filename) : root;
        clearTimeout(watchedTimers.get(root));
        watchedTimers.set(root, setTimeout(() => {
          try { const result = library.importPaths([target]); applyCustomRules(result.added); if (result.added.length) mainWindow?.webContents.send("library-updated", result); } catch {}
        }, 700));
      });
      watchers.push(watcher);
    } catch {}
  }
}

function prepareTools() {
  const packagedTools = path.join(process.resourcesPath, "tools");
  const sourceTools = fs.existsSync(packagedTools) ? packagedTools : path.join(__dirname, "tools");
  const targetTools = path.join(app.getPath("userData"), "tools");
  fs.mkdirSync(targetTools, { recursive: true });
  for (const name of ["yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe"]) {
    const source = path.join(sourceTools, name);
    const target = path.join(targetTools, name);
    const needsCopy = !fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size;
    if (needsCopy) fs.copyFileSync(source, target);
  }
  return targetTools;
}

function prepareCoreSfx() {
  const source = app.isPackaged ? path.join(process.resourcesPath, "core-sfx") : path.join(__dirname, "core-sfx");
  const target = path.join(app.getPath("userData"), "core-sfx");
  fs.mkdirSync(target, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "catalog.json"), "utf8"));
  nativeSfxCatalog = manifest.sounds.map(sound => {
    const sourceFile = path.join(source, sound.file);
    const targetFile = path.join(target, sound.file);
    if (!fs.existsSync(targetFile) || fs.statSync(targetFile).size !== fs.statSync(sourceFile).size) fs.copyFileSync(sourceFile, targetFile);
    const asset = library.addFile(targetFile, { name: sound.name, category: sound.category, tags: sound.tags, source: "Native SFX" });
    return { ...sound, assetId: asset?.id || "", local: true, core: true, previewUrl: `/api/library/file?id=${encodeURIComponent(asset?.id || "")}` };
  });
}

function boardDirectory() {
  const directory = path.join(app.getPath("userData"), "boards");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
function boardFile(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid board ID.");
  return path.join(boardDirectory(), `${safe}.json`);
}
function listBoards() {
  return fs.readdirSync(boardDirectory()).filter(name => name.endsWith(".json")).map(name => {
    try { const board = JSON.parse(fs.readFileSync(path.join(boardDirectory(), name), "utf8")); return { id: board.id, name: board.name, updatedAt: board.updatedAt }; }
    catch { return null; }
  }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function saveBoard(board) {
  if (!board || typeof board !== "object") throw new Error("Invalid board.");
  const safe = { ...board, id: String(board.id || crypto.randomUUID()), name: String(board.name || "Untitled Board").slice(0, 100), updatedAt: new Date().toISOString() };
  if (!Array.isArray(safe.objects) || safe.objects.length > 1500) throw new Error("Board object limit exceeded.");
  const encoded = JSON.stringify(safe);
  if (Buffer.byteLength(encoded) > 150 * 1024 * 1024) throw new Error("Board exceeds 150 MB.");
  fs.writeFileSync(boardFile(safe.id), encoded);
  return safe;
}
function loadBoard(id) {
  const file = boardFile(id);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}
function dataUrlForFile(file) {
  const extension = path.extname(file).toLowerCase();
  const types = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".gif":"image/gif", ".bmp":"image/bmp", ".avif":"image/avif" };
  const mime = types[extension];
  if (!mime) throw new Error("Unsupported board image.");
  if (fs.statSync(file).size > 35 * 1024 * 1024) throw new Error("Board image exceeds 35 MB.");
  return { name: path.basename(file), dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString("base64")}` };
}
async function importBoardImages() {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Add images to reference board", properties: ["openFile", "multiSelections"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }] });
  return result.canceled ? [] : result.filePaths.map(dataUrlForFile);
}
async function importBoardUrl(value) {
  const parsed = safeRemoteUrl(value);
  const response = await fetch(parsed, { headers: { "User-Agent": "Mozilla/5.0 Media-Gecko/0.8" } });
  if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
  const mime = (response.headers.get("content-type") || "").split(";")[0];
  if (!/^image\/(png|jpeg|webp|gif|avif)$/i.test(mime)) throw new Error("URL is not a supported image.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 35 * 1024 * 1024) throw new Error("Board image exceeds 35 MB.");
  return { name: path.basename(parsed.pathname) || "Web image", dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
}
async function exportBoardImage(dataUrl, suggestedName, format) {
  const type = format === "jpg" ? "jpg" : "png";
  const result = await dialog.showSaveDialog(mainWindow, { title: "Export reference board", defaultPath: path.join(app.getPath("pictures"), `${String(suggestedName || "Media Gecko Board").replace(/[<>:\"/\\|?*]+/g, " ")}.${type}`), filters: [{ name: type.toUpperCase(), extensions: [type] }] });
  if (result.canceled) return null;
  const base64 = String(dataUrl).replace(/^data:image\/[^;]+;base64,/, "");
  fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
  return result.filePath;
}

function setWindowTheme(input = {}) {
  const appearance = input.appearance === "light" ? "light" : "dark";
  const overlay = appearance === "light"
    ? { color: "#f1f2f4", symbolColor: "#202327", height: 34 }
    : { color: "#171717", symbolColor: "#f2f2f2", height: 34 };
  if (!mainWindow || mainWindow.isDestroyed()) return { appearance, overlay };
  mainWindow.setIcon(nativeImage.createFromPath(iconPng));
  mainWindow.setTitleBarOverlay(overlay);
  return { appearance, overlay };
}

function safeAsset(id) {
  const asset = library.get(String(id || ""));
  return asset && fs.existsSync(asset.path) ? asset : null;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function performGoogleImageSearch(query, mode = "normal") {
  const normalized = String(query || "").trim().slice(0, 160);
  if (!normalized) return [];
  const transparent = mode === "transparent";
  const cacheKey = `${mode}:${normalized.toLowerCase()}`;
  const cached = imageSearchCache.get(cacheKey);
  if (cached?.length) return cached;
  if (!imageSearchWindow || imageSearchWindow.isDestroyed()) {
    imageSearchWindow = new BrowserWindow({
      show: false, width: 1100, height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, images: true },
    });
    imageSearchWindow.on("closed", () => { imageSearchWindow = null; });
  }
  imageSearchQuery = cacheKey;
  const smartQuery = transparent ? `${normalized} transparent PNG isolated high quality` : mode === "photo" ? `${normalized} professional editorial photo high resolution` : mode === "icon" ? `${normalized} clean vector icon` : mode === "large" ? `${normalized} high resolution` : normalized;
  const filterPart = { transparent:"&tbs=ic:trans,ift:png,isz:m", gif:"&tbs=itp:animated", large:"&tbs=isz:l", icon:"&tbs=isz:i,itp:clipart", photo:"&tbs=itp:photo" }[mode] || "";
  const targetUrl = `https://www.google.com/search?tbm=isch&hl=en&safe=active${filterPart}&q=${encodeURIComponent(smartQuery)}`;
  const domReady = new Promise(resolve => imageSearchWindow.webContents.once("dom-ready", resolve));
  imageSearchWindow.loadURL(targetUrl).catch(() => {});
  await Promise.race([domReady, wait(2500)]);
  for (let attempt = 0; attempt < 8; attempt++) {
    await wait(250);
    const count = await imageSearchWindow.webContents.executeJavaScript(`([...document.images].filter(img => img.naturalWidth >= 80 && img.naturalHeight >= 60 && /gstatic|googleusercontent/.test(img.currentSrc || img.src || '')).length)`);
    if (count >= 24) break;
    await imageSearchWindow.webContents.executeJavaScript(`window.scrollBy(0, Math.max(700, window.innerHeight * .85))`);
  }
  const results = await imageSearchWindow.webContents.executeJavaScript(`(() => {
    const candidates = [...document.images].filter(img => {
      const src = img.currentSrc || img.src || '';
      return img.naturalWidth >= 80 && img.naturalHeight >= 60 && /gstatic|googleusercontent/.test(src) && !/logo|branding/.test(src);
    });
    const seen = new Set();
    return candidates.map((img, index) => {
      const src = img.currentSrc || img.src;
      if (seen.has(src)) return null;
      seen.add(src);
      let node = img;
      let href = '';
      for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
        const anchor = node.closest?.('a[href]');
        if (anchor?.href) { href = anchor.href; break; }
      }
      let sourceUrl = href;
      try {
        const parsed = new URL(href);
        sourceUrl = parsed.searchParams.get('imgurl') || parsed.searchParams.get('url') || href;
      } catch {}
      let sourceDomain = '';
      try { sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch {}
      const title = img.alt || img.closest('[data-ved]')?.innerText?.split('\\n')[0] || 'Image result';
      return { index, thumbnail: src, title, width: img.naturalWidth, height: img.naturalHeight, sourceUrl, sourceDomain };
    }).filter(Boolean).filter(item => !/^google(?: images)?$/i.test(item.title.trim())).slice(0, 48);
  })()`);
  imageSearchCache.set(cacheKey, results);
  return results;
}

function googleImageSearch(query, mode = "normal") {
  const task = imageSearchSerial.then(() => performGoogleImageSearch(query, mode));
  imageSearchSerial = task.catch(() => {});
  return task;
}

async function performMyInstantsSearch(query = "") {
  const normalized = String(query || "").trim().slice(0, 120);
  const cacheKey = normalized.toLowerCase() || "__trending__";
  const cached = myInstantsCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.results;
  if (!myInstantsWindow || myInstantsWindow.isDestroyed()) {
    myInstantsWindow = new BrowserWindow({
      show: false, width: 1100, height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, images: false, partition: "persist:media-gecko-myinstants" },
    });
    myInstantsWindow.on("closed", () => { myInstantsWindow = null; });
  }
  const target = normalized
    ? `https://www.myinstants.com/en/search/?name=${encodeURIComponent(normalized)}`
    : "https://www.myinstants.com/en/index/us/";
  const domReady = new Promise(resolve => myInstantsWindow.webContents.once("dom-ready", resolve));
  await myInstantsWindow.loadURL(target).catch(() => {});
  await Promise.race([domReady, wait(4500)]);
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(250);
    const ready = await myInstantsWindow.webContents.executeJavaScript(`document.querySelectorAll('[onclick*="play("], audio[src], a[href*="/media/sounds/"]').length`).catch(() => 0);
    if (ready) break;
  }
  const results = await myInstantsWindow.webContents.executeJavaScript(`(() => {
    const absolute = value => { try { return new URL(value, location.href).href; } catch { return ''; } };
    const decode = value => { const box=document.createElement('textarea'); box.innerHTML=value||''; return box.value.trim(); };
    const candidates = [...document.querySelectorAll('[onclick*="play("], audio[src], a[href*="/media/sounds/"]')];
    const seen = new Set();
    return candidates.map((node, index) => {
      const code = node.getAttribute('onclick') || '';
      const raw = node.getAttribute('src') || node.getAttribute('href') || code.match(/(?:play|new Audio)\\s*\\(\\s*['\"]([^'\"]+)/i)?.[1] || code.match(/['\"]([^'\"]*\\/media\\/sounds\\/[^'\"]+)/i)?.[1] || '';
      const url = absolute(raw);
      if (!/https:\\/\\/(?:www\\.)?myinstants\\.com\\/media\\/sounds\\//i.test(url) || seen.has(url)) return null;
      seen.add(url);
      const root = node.closest('.instant, [class*="instant"]') || node.parentElement?.parentElement || node.parentElement;
      const anchor = root?.querySelector('a.instant-link, a[href*="/instant/"]');
      const title = decode(anchor?.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || raw.split('/').pop()?.replace(/[-_]/g,' ').replace(/\\.[^.]+$/,'') || 'MyInstant');
      return { id: 'myinstants-' + index + '-' + url.split('/').pop(), title, name: title, url, previewUrl: url, pageUrl: absolute(anchor?.getAttribute('href') || ''), mime: 'audio/mpeg', size: 0, duration: 0, popularity: Math.max(0, 1000-index), source: 'MyInstants', license: 'Uploader-provided · verify usage rights', category: 'Comedy / Meme', tags: ['myinstants','online'] };
    }).filter(Boolean).slice(0, 60);
  })()`).catch(() => []);
  if (!results.length) throw new Error("MyInstants could not be read right now. Open the site once if it shows a verification page.");
  myInstantsCache.set(cacheKey, { results, expiresAt: Date.now() + 10 * 60 * 1000 });
  return results;
}

function searchMyInstants(query) {
  const task = myInstantsSerial.then(() => performMyInstantsSearch(query));
  myInstantsSerial = task.catch(() => {});
  return task;
}

async function cacheMyInstant(item = {}) {
  const parsed = new URL(String(item.url || ""));
  if (parsed.protocol !== "https:" || !/(^|\.)myinstants\.com$/i.test(parsed.hostname) || !parsed.pathname.startsWith("/media/sounds/")) throw new Error("Invalid MyInstants sound URL.");
  const existing = library.list().find(asset => asset.remoteUrl === parsed.href && fs.existsSync(asset.path));
  if (existing) return existing;
  const request = { headers: { "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.5", "Referer": "https://www.myinstants.com/" }, signal: AbortSignal.timeout(15000) };
  const response = myInstantsWindow && !myInstantsWindow.isDestroyed()
    ? await myInstantsWindow.webContents.session.fetch(parsed.href, request)
    : await fetch(parsed, { ...request, headers: { ...request.headers, "User-Agent": "Mozilla/5.0 Media-Gecko/1.5" } });
  if (!response.ok) throw new Error("MyInstants sound download failed.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("MyInstants sound is empty or too large.");
  const title = String(item.title || path.basename(parsed.pathname, path.extname(parsed.pathname)) || "MyInstant").replace(/[<>:"/\\|?*]+/g, " ").trim().slice(0, 100);
  const hash = crypto.createHash("sha1").update(parsed.href).digest("hex").slice(0, 10);
  const directory = path.join(cacheDirectory(), "native-sfx", "myinstants");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${title} [${hash}].mp3`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  pruneCache();
  return library.addFile(file, { name: title, source: "MyInstants", remoteUrl: parsed.href, tags: ["myinstants", "online"] });
}

async function resolveGoogleImage(query, mode, index, fallback) {
  const safeMode = ["transparent","normal","gif","large","icon","photo"].includes(mode) ? mode : "normal";
  const key = `${safeMode}:${String(query || "").trim().toLowerCase()}`;
  if (!imageSearchWindow || imageSearchWindow.isDestroyed() || imageSearchQuery !== key) await googleImageSearch(query, mode);
  await imageSearchWindow.webContents.executeJavaScript(`(() => {
    const items = [...document.images].filter(img => {
      const src = img.currentSrc || img.src || '';
      return img.naturalWidth >= 80 && img.naturalHeight >= 60 && /gstatic|googleusercontent/.test(src) && !/logo|branding/.test(src);
    });
    items[${Number(index) || 0}]?.click();
  })()`);
  await wait(650);
  const resolved = await imageSearchWindow.webContents.executeJavaScript(`(() => {
    const images = [...document.images].map(img => ({ url: img.currentSrc || img.src || '', width: img.naturalWidth, height: img.naturalHeight }))
      .filter(item => /^https:\\/\\//.test(item.url) && item.width >= 250 && item.height >= 180 && !/logo|branding/.test(item.url))
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const image = images.find(item => !/gstatic|googleusercontent/.test(item.url)) || images[0] || null;
    const source = [...document.querySelectorAll('a[href]')].reverse().find(anchor => {
      const box = anchor.getBoundingClientRect();
      return /^https:\\/\\//.test(anchor.href) && !/google\\./.test(new URL(anchor.href).hostname) && box.width > 0 && box.height > 0;
    });
    return image ? { ...image, sourceUrl: source?.href || '' } : null;
  })()`);
  return resolved || { url: fallback, width: 0, height: 0 };
}

function safeRemoteUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS images are supported.");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) throw new Error("Private network image blocked.");
  return parsed;
}

async function cacheRemoteImage(url, title, persistent = false, source = "Image Search") {
  const parsed = safeRemoteUrl(url);
  const response = await fetch(parsed, { headers: { "User-Agent": "Mozilla/5.0 Media-Gecko/0.6", Referer: "https://www.google.com/" } });
  if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
  const type = (response.headers.get("content-type") || "").split(";")[0];
  const extensions = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" };
  if (!extensions[type]) throw new Error("Remote result is not a supported image.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 40 * 1024 * 1024) throw new Error("Image exceeds 40 MB limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 40 * 1024 * 1024) throw new Error("Image exceeds 40 MB limit.");
  const safeName = String(title || "Google image").replace(/[<>:"/\\|?*]+/g, " ").trim().slice(0, 100) || "Google image";
  const hash = require("node:crypto").createHash("sha1").update(url).digest("hex").slice(0, 10);
  const directory = persistent ? path.join(process.env.MEDIA_GECKO_DOWNLOAD_DIR, "Images") : path.join(process.env.MEDIA_GECKO_CACHE_DIR || app.getPath("userData"), "images");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${safeName} [${hash}]${extensions[type]}`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  const asset = library.addFile(file, { name: safeName, source, remoteUrl: url });
  const size = nativeImage.createFromPath(file).getSize();
  return library.update(asset.id, { width: size.width, height: size.height });
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) { const stats = fs.statSync(target); output.push({ path: target, size: stats.size, time: stats.mtimeMs }); }
    }
  }
  return output;
}

function cacheDirectory() { return process.env.MEDIA_GECKO_CACHE_DIR || path.join(app.getPath("userData"), "cache"); }
function cacheSettingsFile() { return path.join(app.getPath("userData"), "cache-settings.json"); }
function cacheLimit() {
  try { return Number(JSON.parse(fs.readFileSync(cacheSettingsFile(), "utf8")).limit ?? 5 * 1024 ** 3); } catch { return 5 * 1024 ** 3; }
}
function setCacheLimit(limit) {
  const safe = [0, 1 * 1024 ** 3, 5 * 1024 ** 3, 10 * 1024 ** 3].includes(Number(limit)) ? Number(limit) : 5 * 1024 ** 3;
  fs.writeFileSync(cacheSettingsFile(), JSON.stringify({ limit: safe }));
  process.env.MEDIA_GECKO_CACHE_LIMIT_BYTES = String(safe);
  pruneCache();
  return cacheStatus();
}
function pruneCache() {
  if (appSettings.autoCleanup === false) return;
  const limit = cacheLimit();
  if (!limit) return;
  const files = walkFiles(cacheDirectory()).sort((a, b) => a.time - b.time);
  let total = files.reduce((sum, item) => sum + item.size, 0);
  for (const item of files) {
    if (total <= limit) break;
    try { fs.unlinkSync(item.path); total -= item.size; } catch {}
  }
  library.list();
}
function cacheStatus() {
  const root = cacheDirectory();
  const sum = directory => walkFiles(directory).reduce((total, item) => total + item.size, 0);
  const direct = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).reduce((total, entry) => total + fs.statSync(path.join(root, entry.name)).size, 0) : 0;
  const groups = { preview: sum(path.join(root, "video-previews")), image: sum(path.join(root, "images")), audio: sum(path.join(root, "audio")), download: direct };
  return { groups, total: Object.values(groups).reduce((a, b) => a + b, 0), limit: cacheLimit() };
}
function clearCache(kind) {
  const root = path.resolve(cacheDirectory());
  const targets = { preview: path.join(root, "video-previews"), image: path.join(root, "images"), audio: path.join(root, "audio") };
  const removeDirectory = target => {
    const resolved = path.resolve(target);
    if (resolved === root || !resolved.startsWith(root + path.sep)) return;
    fs.rmSync(resolved, { recursive: true, force: true });
  };
  if (kind === "all") {
    for (const target of Object.values(targets)) removeDirectory(target);
    for (const item of walkFiles(root).filter(item => path.dirname(item.path) === root)) try { fs.unlinkSync(item.path); } catch {}
  } else if (targets[kind]) removeDirectory(targets[kind]);
  else if (kind === "download") for (const item of walkFiles(root).filter(item => path.dirname(item.path) === root)) try { fs.unlinkSync(item.path); } catch {}
  library.list();
  return cacheStatus();
}

async function browserImageAction(sender, payload) {
  const action = String(payload?.action || "");
  const url = String(payload?.url || "");
  const title = String(payload?.title || "Browser image");
  try {
    if (action === "open") { safeRemoteUrl(url); await shell.openExternal(url); return; }
    if (action === "download") { safeRemoteUrl(url); sender.downloadURL(url); return; }
    let asset = browserImageAssets.get(url);
    if ((!asset || !fs.existsSync(asset.path)) && action !== "save") {
      let pending = browserImagePending.get(url);
      if (!pending) {
        pending = cacheRemoteImage(url, title, false, "Browser").finally(() => browserImagePending.delete(url));
        browserImagePending.set(url, pending);
      }
      asset = await pending;
    }
    if (action === "save") asset = await cacheRemoteImage(url, title, true, "Browser");
    if (action !== "save") browserImageAssets.set(url, asset);
    if (action === "copy") clipboard.writeImage(nativeImage.createFromPath(asset.path));
    if (action === "drag") {
      mainWindow?.webContents.send("drag-state", "active");
      sender.startDrag({ file: asset.path, icon: dragIcon });
      mainWindow?.webContents.send("drag-state", "idle");
    }
    sender.send("browser-image-result", { ok: true, action, name: asset.name, url });
  } catch (error) {
    sender.send("browser-image-result", { ok: false, action, error: error.message });
  }
}

async function enrichImport(result) {
  for (const asset of result.added) {
    try {
      if (asset.kind === "audio") {
        const probe = path.join(toolsDir, "ffprobe.exe");
        const { stdout } = await execFileAsync(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", asset.path], { windowsHide: true });
        library.update(asset.id, { duration: Number(stdout.trim()) });
      } else if (asset.kind === "image") {
        const size = nativeImage.createFromPath(asset.path).getSize();
        library.update(asset.id, { width: size.width, height: size.height });
      } else if (asset.kind === "video") {
        const probe = path.join(toolsDir, "ffprobe.exe");
        const { stdout } = await execFileAsync(probe, ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", asset.path], { windowsHide: true });
        const data = JSON.parse(stdout);
        const stream = (data.streams || []).find(item => item.width && item.height) || {};
        library.update(asset.id, { duration: Number(data.format?.duration || 0), width: Number(stream.width || 0), height: Number(stream.height || 0) });
      }
    } catch {}
  }
  const added = result.added.map(asset => library.get(asset.id));
  applyCustomRules(added);
  return { added: added.map(asset => library.get(asset.id)), total: library.count() };
}

ipcMain.on("start-drag", (event, id) => {
  const asset = safeAsset(id);
  if (asset) {
    event.sender.send("drag-state", "active");
    event.sender.startDrag({ file: asset.path, icon: dragIcon });
    event.sender.send("drag-state", "idle");
  }
});

ipcMain.on("reveal-file", (_event, id) => {
  const asset = safeAsset(id);
  if (asset) shell.showItemInFolder(asset.path);
});
ipcMain.handle("copy-file-path", (_event, id) => {
  const asset = safeAsset(id);
  if (!asset) return false;
  clipboard.writeText(asset.path);
  return true;
});

ipcMain.handle("library-list", (_event, options) => library.list(options || {}));
ipcMain.handle("library-count", (_event, filters) => library.count(filters || {}));
ipcMain.handle("library-search", (_event, query, options) => library.search(query, options || {}));
ipcMain.handle("library-smart", (_event, name, limit) => library.smartFolder(name, limit));
ipcMain.handle("library-duplicates", () => library.duplicates());
ipcMain.handle("library-similar", (_event, id) => library.similar(id));
ipcMain.handle("library-mark-used", (_event, id) => library.markUsed(id));
ipcMain.handle("sound-lab-render", async (_event, id, input = {}) => {
  const asset = library.get(id);
  if (!asset || asset.kind !== "audio" || !fs.existsSync(asset.path)) throw new Error("Audio asset is unavailable.");
  const clamp = (value, low, high, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback; };
  const speed = clamp(input.speed, 0.5, 2, 1), pitch = clamp(input.pitch, 0.5, 2, 1);
  const filters = [];
  if (Math.abs(pitch - 1) > .001) filters.push(`asetrate=44100*${pitch.toFixed(4)},aresample=44100,atempo=${(1 / pitch).toFixed(4)}`);
  if (Math.abs(speed - 1) > .001) filters.push(`atempo=${speed.toFixed(4)}`);
  const bass = clamp(input.bass, -20, 20, 0), treble = clamp(input.treble, -20, 20, 0);
  if (bass) filters.push(`bass=g=${bass}`); if (treble) filters.push(`treble=g=${treble}`);
  if (input.reverb) filters.push("aecho=0.8:0.7:55:0.22");
  if (input.reverse) filters.push("areverse");
  if (input.normalize) filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  if (input.fadeIn) filters.push(`afade=t=in:st=0:d=${clamp(input.fadeIn, 0, 10, .15)}`);
  if (input.mono) filters.push("pan=mono|c0=.5*c0+.5*c1");
  const trimStart = clamp(input.trimStart, 0, 86400, 0), trimEnd = clamp(input.trimEnd, 0, 86400, 0);
  if (trimStart || trimEnd > trimStart) filters.unshift(`atrim=start=${trimStart}${trimEnd > trimStart ? `:end=${trimEnd}` : ""},asetpts=PTS-STARTPTS`);
  const directory = path.join(appSettingsView().cacheDir, "processed"); fs.mkdirSync(directory, { recursive: true });
  const hash = crypto.createHash("sha1").update(`${asset.path}:${JSON.stringify(input)}`).digest("hex").slice(0, 12);
  const output = path.join(directory, `${asset.name.replace(/[<>:"/\\|?*]+/g, " ").slice(0, 90)} [Gecko ${hash}].wav`);
  if (!fs.existsSync(output)) {
    const args = ["-y", "-i", asset.path]; if (filters.length) args.push("-af", filters.join(",")); args.push("-c:a", "pcm_s16le", output);
    await execFileAsync(path.join(toolsDir, "ffmpeg.exe"), args, { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
  }
  const rendered = library.addFile(output, { name: `${asset.name} (Gecko Edit)`, category: asset.category, tags: [...asset.tags, "processed"], source: "SFX Lab" });
  mainWindow?.webContents.send("library-updated", { added: [rendered] });
  return rendered;
});
ipcMain.handle("library-update", (_event, id, changes) => library.update(id, changes));
ipcMain.handle("library-remove", (_event, id) => library.remove(id));
ipcMain.handle("google-image-search", (_event, query, mode) => googleImageSearch(query, mode));
ipcMain.handle("myinstants-search", (_event, query) => searchMyInstants(query));
ipcMain.handle("myinstants-cache", (_event, item) => cacheMyInstant(item));
ipcMain.handle("google-image-resolve", (_event, query, mode, index, fallback) => resolveGoogleImage(query, mode, index, fallback));
ipcMain.handle("cache-remote-image", (_event, url, title) => cacheRemoteImage(url, title));
ipcMain.handle("copy-remote-image", async (_event, url, title) => { const asset=await cacheRemoteImage(url,title,false,"Image Search"); clipboard.writeImage(nativeImage.createFromPath(asset.path)); return asset; });
ipcMain.handle("copy-text", (_event, value) => { clipboard.writeText(String(value||"")); return true; });
ipcMain.handle("cache-status", () => cacheStatus());
ipcMain.handle("cache-clear", (_event, kind) => clearCache(String(kind || "")));
ipcMain.handle("cache-limit", (_event, limit) => setCacheLimit(limit));
ipcMain.handle("app-settings-get", () => appSettingsView());
ipcMain.handle("app-settings-update", (_event, changes) => writeAppSettings(changes));
ipcMain.handle("app-settings-reset", () => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  appSettings = { ...defaultAppSettings };
  return writeAppSettings(appSettings);
});
ipcMain.handle("choose-folder", async (_event, key) => {
  if (!["downloadDir", "libraryDir", "cacheDir"].includes(key)) throw new Error("Unsupported folder setting.");
  const current = appSettingsView()[key];
  const result = await dialog.showOpenDialog(mainWindow, { title: `Choose ${key === "downloadDir" ? "download" : key === "libraryDir" ? "library" : "cache"} folder`, defaultPath: current, properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? appSettingsView() : writeAppSettings({ [key]: result.filePaths[0] });
});
ipcMain.handle("native-sfx-list", () => nativeSfxCatalog);
ipcMain.handle("native-sfx-clear-cache", () => {
  const target = path.resolve(path.join(cacheDirectory(), "native-sfx"));
  const root = path.resolve(cacheDirectory());
  if (target.startsWith(root + path.sep)) fs.rmSync(target, { recursive: true, force: true });
  return nativeSfxCatalog;
});
ipcMain.handle("boards-list", () => listBoards());
ipcMain.handle("board-load", (_event, id) => loadBoard(id));
ipcMain.handle("board-save", (_event, board) => saveBoard(board));
ipcMain.handle("board-delete", (_event, id) => { const file = boardFile(id); if (fs.existsSync(file)) fs.unlinkSync(file); return listBoards(); });
ipcMain.handle("board-import-images", () => importBoardImages());
ipcMain.handle("board-import-url", (_event, url) => importBoardUrl(url));
ipcMain.handle("board-export", (_event, dataUrl, name, format) => exportBoardImage(dataUrl, name, format));
ipcMain.handle("window-fullscreen", () => { mainWindow.setFullScreen(!mainWindow.isFullScreen()); return mainWindow.isFullScreen(); });
ipcMain.handle("window-always-on-top", (_event, enabled) => { mainWindow.setAlwaysOnTop(Boolean(enabled), "floating"); return mainWindow.isAlwaysOnTop(); });
ipcMain.handle("theme-accent", (_event, input) => setWindowTheme(input && typeof input === "object" ? input : { color: String(input || "") }));
ipcMain.handle("app-info", () => ({ name: app.getName(), version: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle("universal-search", (_event, query) => universalSearch(query));
ipcMain.handle("tray-list", () => trayView());
ipcMain.handle("tray-add", (_event, id) => { if (library.get(id) && !workspaceState.tray.includes(id)) workspaceState.tray.push(id); saveWorkspace(); return trayView(); });
ipcMain.handle("tray-remove", (_event, id) => { workspaceState.tray = workspaceState.tray.filter(value => value !== id); saveWorkspace(); return trayView(); });
ipcMain.handle("tray-clear", () => { workspaceState.tray = []; saveWorkspace(); return []; });
ipcMain.handle("projects-list", (_event, includeArchived = false) => workspaceState.projects.filter(project => includeArchived || !project.archived).map(projectView));
ipcMain.handle("project-save", (_event, input) => {
  const id = String(input?.id || crypto.randomUUID());
  let project = workspaceState.projects.find(value => value.id === id);
  if (!project) { project = { id, name: "Untitled Project", notes: "", assetIds: [], boardIds: [], archived: false, createdAt: Date.now() }; workspaceState.projects.unshift(project); }
  if (typeof input?.name === "string" && input.name.trim()) project.name = input.name.trim().slice(0, 120);
  if (typeof input?.notes === "string") project.notes = input.notes.slice(0, 20000);
  if (typeof input?.archived === "boolean") project.archived = input.archived;
  if (Array.isArray(input?.assetIds)) project.assetIds = [...new Set(input.assetIds.filter(id => library.get(id)))];
  if (Array.isArray(input?.boardIds)) project.boardIds = [...new Set(input.boardIds.map(String))];
  project.updatedAt = Date.now(); saveWorkspace(); return projectView(project);
});
ipcMain.handle("project-delete", (_event, id) => { workspaceState.projects = workspaceState.projects.filter(project => project.id !== id); saveWorkspace(); return true; });
ipcMain.handle("project-add-asset", (_event, projectId, assetId) => { const project = workspaceState.projects.find(value => value.id === projectId); if (!project || !library.get(assetId)) return null; project.assetIds ||= []; if (!project.assetIds.includes(assetId)) project.assetIds.push(assetId); project.updatedAt = Date.now(); saveWorkspace(); return projectView(project); });
ipcMain.handle("workspace-rules", (_event, rules) => { if (Array.isArray(rules)) { workspaceState.rules = rules.slice(0, 100); saveWorkspace(); } return workspaceState.rules; });
ipcMain.handle("envato-status", () => ({ connected:Boolean(envatoToken()) }));
ipcMain.handle("envato-set-token", (_event, token) => { const value=String(token||"").trim(); workspaceState.integrations ||= {}; workspaceState.integrations.envatoToken=value&&safeStorage.isEncryptionAvailable()?safeStorage.encryptString(value).toString("base64"):""; saveWorkspace(); return { connected:Boolean(value) }; });
ipcMain.handle("envato-test", async () => { const token=envatoToken(); if(!token) throw new Error("Enter Envato personal token."); const response=await fetch("https://api.envato.com/v1/market/total-items.json",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}); if(!response.ok) throw new Error(`Envato connection failed (${response.status}).`); return {connected:true}; });
ipcMain.handle("envato-search", async (_event, query) => { const token=envatoToken(), term=String(query||"").trim(); if(!token||!term)return []; const params=new URLSearchParams({term,"page_size":"12",site:"audiojungle.net"}); const response=await fetch(`https://api.envato.com/v1/discovery/search/search/item?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}); if(!response.ok)return []; const data=await response.json(); return (data.matches||[]).map(match=>({type:"ONLINE",media:"audio",label:match.name||"Envato item",subtitle:`Envato · ${match.author_username||"AudioJungle"}`,url:match.url||match.item_url||"",provider:"Envato"})).filter(item=>/^https:\/\//.test(item.url)); });
ipcMain.handle("assistant-status", () => ({ connected: Boolean(assistantToken()), model: "gpt-5-mini" }));
ipcMain.handle("assistant-save-key", (_event, token) => { const value=String(token||"").trim(); if(value&&!safeStorage.isEncryptionAvailable())throw new Error("Windows secure storage is unavailable."); workspaceState.integrations ||= {}; workspaceState.integrations.openaiToken=value?safeStorage.encryptString(value).toString("base64"):""; saveWorkspace(); return { connected:Boolean(assistantToken()), model:"gpt-5-mini" }; });
ipcMain.handle("assistant-chat", (_event, messages, project) => askAssistant(messages, project));
ipcMain.handle("watched-folders", () => workspaceState.watchedFolders);
ipcMain.handle("watched-folder-add", async () => { const result = await dialog.showOpenDialog(mainWindow, { title: "Watch media folder", properties: ["openDirectory"] }); if (!result.canceled && !workspaceState.watchedFolders.includes(result.filePaths[0])) { workspaceState.watchedFolders.push(result.filePaths[0]); saveWorkspace(); startWatchedFolders(); } return workspaceState.watchedFolders; });
ipcMain.handle("watched-folder-remove", (_event, folder) => { workspaceState.watchedFolders = workspaceState.watchedFolders.filter(value => value !== folder); saveWorkspace(); startWatchedFolders(); return workspaceState.watchedFolders; });
ipcMain.handle("browser-history-add", (_event, item) => { if (!/^https?:\/\//i.test(item?.url || "")) return workspaceState.browserHistory; workspaceState.browserHistory = [{ url: item.url, title: String(item.title || item.url).slice(0, 160), time: Date.now() }, ...workspaceState.browserHistory.filter(value => value.url !== item.url)].slice(0, 200); saveWorkspace(); return workspaceState.browserHistory; });
ipcMain.handle("show-main-result", (_event, item) => { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send("universal-result", item); miniWindow?.hide(); return true; });
ipcMain.on("mini-hide", () => { miniWindow?.hide(); miniPreviewWindow?.hide(); });
ipcMain.on("mini-preview-show", (event, item) => {
  if (!miniWindow || event.sender !== miniWindow.webContents || !miniPreviewWindow || miniPreviewWindow.isDestroyed()) return;
  const url = String(item?.url || "");
  if (!/^https:\/\//i.test(url) && !/^\/api\//i.test(url)) return;
  const mini = miniWindow.getBounds();
  const area = screen.getDisplayMatching(mini).workArea;
  const width = 320, height = 320;
  let x = mini.x + mini.width + 10;
  if (x + width > area.x + area.width) x = mini.x - width - 10;
  x = Math.max(area.x, Math.min(x, area.x + area.width - width));
  const offset = Math.max(0, Math.min(Number(item?.offsetY || 0) - 80, mini.height - height));
  const y = Math.max(area.y, Math.min(mini.y + offset, area.y + area.height - height));
  miniPreviewWindow.setBounds({ x, y, width, height });
  miniPreviewWindow.webContents.send("mini-preview-data", { url, title: String(item?.title || "Image preview").slice(0, 180), subtitle: String(item?.subtitle || "").slice(0, 220) });
  miniPreviewWindow.showInactive();
});
ipcMain.on("mini-preview-hide", event => { if (!miniWindow || event.sender === miniWindow.webContents) miniPreviewWindow?.hide(); });
ipcMain.on("browser-image-action", (event, payload) => browserImageAction(event.sender, payload));
ipcMain.handle("import-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import media files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Media", extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "mp4", "mov", "mkv", "webm", "avi"] }],
  });
  return result.canceled ? { added: [], total: library.count() } : enrichImport(library.importPaths(result.filePaths, progress => mainWindow?.webContents.send("index-progress", progress)));
});
ipcMain.handle("import-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Index media folder", properties: ["openDirectory"] });
  return result.canceled ? { added: [], total: library.count() } : enrichImport(library.importPaths(result.filePaths, progress => mainWindow?.webContents.send("index-progress", progress)));
});

function configureBrowserDownloads(browserSession) {
  browserSession.on("will-download", (_event, item) => {
    const target = path.join(process.env.MEDIA_GECKO_DOWNLOAD_DIR, item.getFilename());
    item.setSavePath(target);
    item.once("done", async (_doneEvent, state) => {
      if (state !== "completed" || !fs.existsSync(target)) return;
      const asset = library.addFile(target, { source: "browser" });
      if (!asset) return mainWindow?.webContents.send("browser-download", { ok: false, name: item.getFilename() });
      const result = await enrichImport({ added: [asset] });
      mainWindow?.webContents.send("browser-download", { ok: true, asset: result.added[0] });
    });
  });
}

app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;
  contents.on("context-menu", (_menuEvent, params) => {
    if (params.mediaType !== "image" || !/^https:\/\//i.test(params.srcURL || "")) return;
    let original = params.srcURL;
    try {
      const linked = new URL(params.linkURL || params.srcURL);
      const candidate = linked.searchParams.get("imgurl") || linked.searchParams.get("mediaurl");
      if (candidate && /^https:\/\//i.test(candidate)) original = candidate;
      else if (/\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(linked.href)) original = linked.href;
    } catch {}
    const payload = { url: original, title: params.altText || path.basename(new URL(original).pathname) || "Browser image" };
    Menu.buildFromTemplate([
      { label: "Save to Media Gecko Library", click: () => browserImageAction(contents, { ...payload, action: "save" }) },
      { label: "Copy Image", click: () => browserImageAction(contents, { ...payload, action: "copy" }) },
      { label: "Download", click: () => browserImageAction(contents, { ...payload, action: "download" }) },
      { type: "separator" },
      { label: "Open Original Image", click: () => browserImageAction(contents, { ...payload, action: "open" }) },
    ]).popup({ window: mainWindow });
  });
});

if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    try {
    const settings = appSettingsView();
    process.env.MEDIA_GECKO_DOWNLOAD_DIR = settings.downloadDir;
    toolsDir = prepareTools();
    process.env.MEDIA_GECKO_TOOLS_DIR = toolsDir;
    process.env.MEDIA_GECKO_LIBRARY_DIR = settings.libraryDir;
    process.env.MEDIA_GECKO_CACHE_DIR = settings.cacheDir;
    process.env.MEDIA_GECKO_CACHE_LIMIT_BYTES = String(cacheLimit());
    process.env.MEDIA_GECKO_AUTO_CLEANUP = settings.autoCleanup === false ? "false" : "true";
    process.env.MEDIA_GECKO_PORT = "0";
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: Boolean(settings.startWindows), path: process.execPath });
    library.configure(process.env.MEDIA_GECKO_LIBRARY_DIR);
    try { prepareCoreSfx(); } catch (error) { logProblem("core-sfx", error); }
    try { startWatchedFolders(); } catch (error) { logProblem("watched-folders", error); }
    try { configureBrowserDownloads(session.defaultSession); } catch (error) { logProblem("browser-downloads", error); }
    try { configureBrowserDownloads(session.fromPartition("persist:media-gecko-browser")); } catch (error) { logProblem("browser-profile", error); }
    try { configureBrowserDownloads(session.fromPartition("persist:media-gecko-images")); } catch (error) { logProblem("image-profile", error); }
    const backend = require("./server");
    downloadDir = backend.DOWNLOAD_DIR;
    const port = await backend.ready;
    createWindow(port);
    try { createMiniWindow(port); } catch (error) { logProblem("mini-gecko", error); }
    } catch (error) {
      logProblem("startup", error);
      if (!mainWindow) app.quit();
    }
  }).catch(error => { logProblem("ready", error); app.quit(); });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); for (const watcher of watchers) try { watcher.close(); } catch {} try { library.close(); } catch (error) { logProblem("library-close", error); } });
  app.on("window-all-closed", () => app.quit());
}
