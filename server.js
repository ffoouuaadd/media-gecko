const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const library = require("./library-store");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const RESOURCE_ROOT = process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, "tools")) ? process.resourcesPath : ROOT;
const TOOLS_DIR = process.env.MEDIA_GECKO_TOOLS_DIR || path.join(RESOURCE_ROOT, "tools");
const DOWNLOAD_DIR = process.env.MEDIA_GECKO_DOWNLOAD_DIR || path.join(ROOT, "downloads");
const LIBRARY_DIR = process.env.MEDIA_GECKO_LIBRARY_DIR || path.join(ROOT, ".media-gecko");
const CACHE_DIR = process.env.MEDIA_GECKO_CACHE_DIR || path.join(LIBRARY_DIR, "cache");
const PORT = Number(process.env.MEDIA_GECKO_PORT || 4173);
const PREVIEW_TTL = 10 * 60 * 1000;
const youtubePreviewCache = new Map();
const youtubePreviewPending = new Map();
const searchCache = new Map();
const approvedOnlineUrls = new Set();
const downloadJobs = new Map();
const downloadClients = new Set();

function publishJob(job) {
  if (!job?.id) return;
  downloadJobs.set(job.id, job);
  const payload = `data: ${JSON.stringify({ ...job, child: undefined })}\n\n`;
  for (const client of downloadClients) { try { client.write(payload); } catch { downloadClients.delete(client); } }
}
function beginJob(id, label) {
  if (!id) return null;
  const job = { id: String(id), label: String(label || "Media download").slice(0, 160), state: "downloading", percent: 0, speed: "", eta: "", startedAt: Date.now() };
  publishJob(job); return job;
}
function updateJob(job, changes) { if (job) { Object.assign(job, changes); publishJob(job); } }

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!library.isConfigured()) library.configure(LIBRARY_DIR);

function tool(name) {
  const local = path.join(TOOLS_DIR, process.platform === "win32" ? `${name}.exe` : name);
  return fs.existsSync(local) ? local : name;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function run(command, args, timeoutMs = 120000, job = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: RESOURCE_ROOT,
      windowsHide: true,
      env: { ...process.env, PATH: `${TOOLS_DIR}${path.delimiter}${process.env.PATH || ""}` },
    });
    if (job) job.child = child;
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Operation timed out.")); }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => {
      const text = chunk.toString(); stderr += text;
      if (job) {
        const match = text.match(/\[download\]\s+([\d.]+)%.*?at\s+([^\s]+).*?ETA\s+([^\s]+)/i);
        if (match) updateJob(job, { percent: Math.min(99, Number(match[1]) || 0), speed: match[2], eta: match[3] });
      }
    });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (job) delete job.child;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `Command exited with code ${code}.`));
    });
  });
}

function cleanError(error) {
  if (error.code === "ENOENT") return "Media engine could not start. Reopen latest Media Gecko build.";
  const text = String(error.message || error);
  if (/private|login required|cookies|not available|unavailable|requested content is not available/i.test(text)) return "Media is private, unavailable, protected, or requires sign-in.";
  if (/unsupported url/i.test(text)) return "This media URL is not supported.";
  return text.split(/\r?\n/).slice(-2).join(" ").replace(/^ERROR:\s*/i, "");
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 200_000) throw new Error("Request too large.");
  }
  return JSON.parse(body || "{}");
}

async function searchYouTube(query) {
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(`youtube:${cacheKey}`);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const { stdout } = await run(tool("yt-dlp"), ["--dump-single-json", "--flat-playlist", "--no-warnings", `ytsearch30:${query} sound effect`]);
  const data = JSON.parse(stdout);
  const blocked = /\b(compilation|one hour|1 hour|10 hours|music|song|remix|tutorial|reaction|origin|how|made it|guys look)\b/i;
  const entries = (data.entries || []).filter(item => {
    const seconds = Number(item.duration || 0);
    return seconds > 0 && seconds <= 60 && !blocked.test(item.title || "");
  });
  const exact = entries.filter(item => /\b(sound effects?|sfx)\b/i.test(item.title || ""));
  const fallback = entries.filter(item => !exact.includes(item));
  const value = [...exact, ...fallback].slice(0, 6).map(item => ({
    id: item.id,
    title: item.title || "Untitled",
    channel: item.channel || item.uploader || "YouTube",
    duration: item.duration || 0,
    url: item.url?.startsWith("http") ? item.url : `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail: item.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
  }));
  searchCache.set(`youtube:${cacheKey}`, { value, expiresAt: Date.now() + PREVIEW_TTL });
  return value;
}

async function youtubePreviewUrl(sourceUrl) {
  if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(sourceUrl || "")) throw new Error("Invalid YouTube preview URL.");
  const cached = youtubePreviewCache.get(sourceUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (youtubePreviewPending.has(sourceUrl)) return youtubePreviewPending.get(sourceUrl);
  const pending = run(tool("yt-dlp"), ["--no-playlist", "--no-warnings", "-f", "bestaudio[abr<=128]/bestaudio", "--get-url", sourceUrl])
    .then(result => {
      const mediaUrl = result.stdout.trim().split(/\r?\n/)[0];
      if (!/^https?:\/\//i.test(mediaUrl)) throw new Error("Preview stream unavailable.");
      youtubePreviewCache.set(sourceUrl, { url: mediaUrl, expiresAt: Date.now() + PREVIEW_TTL });
      return mediaUrl;
    })
    .finally(() => youtubePreviewPending.delete(sourceUrl));
  youtubePreviewPending.set(sourceUrl, pending);
  return pending;
}

async function youtubeVideoPreviewUrl(sourceUrl) {
  if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(sourceUrl || "")) throw new Error("Invalid YouTube preview URL.");
  const key = `video:${sourceUrl}`;
  const cached = youtubePreviewCache.get(key);
  if (cached && fs.existsSync(cached.file)) return cached.file;
  if (youtubePreviewPending.has(key)) return youtubePreviewPending.get(key);
  const directory = path.join(CACHE_DIR, "video-previews");
  fs.mkdirSync(directory, { recursive: true });
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
  const output = path.join(directory, `${hash}.%(ext)s`);
  const pending = run(tool("yt-dlp"), ["--no-playlist", "--no-warnings", "--ffmpeg-location", TOOLS_DIR, "-f", "bestvideo[height<=480]+bestaudio/bestvideo+bestaudio", "--merge-output-format", "mp4", "--output", output, "--print", "after_move:filepath", sourceUrl], 180000)
    .then(result => {
      const file = result.stdout.trim().split(/\r?\n/).at(-1);
      if (!file || !fs.existsSync(file)) throw new Error("Video preview file unavailable.");
      youtubePreviewCache.set(key, { file });
      return file;
    })
    .finally(() => youtubePreviewPending.delete(key));
  youtubePreviewPending.set(key, pending);
  return pending;
}

function soundLibraries(query) {
  const encoded = encodeURIComponent(query);
  return [
    { name: "MyInstants", note: "Instant sound buttons", url: `https://www.myinstants.com/en/search/?name=${encoded}` },
    { name: "Pixabay SFX", note: "Sound effects and audio", url: `https://pixabay.com/sound-effects/search/${encoded}/` },
    { name: "Mixkit", note: "Free sound-effect catalog", url: `https://mixkit.co/free-sound-effects/?q=${encoded}` },
    { name: "Freesound", note: "Community audio library", url: `https://freesound.org/search/?q=${encoded}` },
    { name: "ZapSplat", note: "Large sound library", url: `https://www.zapsplat.com/?s=${encoded}` },
    { name: "Uppbeat", note: "Creator sound effects", url: `https://uppbeat.io/sfx/search/${encoded}` },
  ];
}

function imageLibraries(query) {
  const encoded = encodeURIComponent(query);
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    { name: "Pixabay PNG", note: "Photos and transparent assets", url: `https://pixabay.com/images/search/${encoded}/?colors=transparent` },
    { name: "Openverse", note: "Openly licensed images", url: `https://openverse.org/search/image?q=${encoded}` },
    { name: "Wikimedia Commons", note: "PNG media search", url: `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${encoded}%20filetype%3Apng` },
    { name: "PNGimg", note: "Transparent PNG library", url: `https://pngimg.com/images/${slug}` },
  ];
}

async function searchCommonsAudio(query) {
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(`commons:${cacheKey}`);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const searches = ["audio", "sound", "recording"].map(async hint => {
    const params = new URLSearchParams({
      action: "query", format: "json", origin: "*", generator: "search",
      gsrsearch: `${query} ${hint}`,
      gsrnamespace: "6", gsrlimit: "12", prop: "videoinfo|imageinfo",
      viprop: "url|mime|size|derivatives|mediatype", iiprop: "extmetadata",
    });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "Media-Gecko/0.6 desktop asset browser" },
    });
    if (!response.ok) throw new Error("Commons search unavailable.");
    return Object.values((await response.json()).query?.pages || {});
  });
  const pages = (await Promise.all(searches)).flat();
  const seen = new Set();
  const value = pages.map(page => {
    const info = page.videoinfo?.[0] || {};
    const meta = page.imageinfo?.[0]?.extmetadata || {};
    const preview = (info.derivatives || []).find(item => item.transcodekey === "ogg")
      || (info.derivatives || []).find(item => item.transcodekey === "mp3")
      || { src: info.url };
    return {
      id: String(page.pageid),
      title: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
      url: info.url,
      previewUrl: preview.src || info.url,
      pageUrl: info.descriptionurl,
      mime: info.mime,
      size: info.size || 0,
      duration: Number(info.duration || 0),
      source: "Wikimedia Commons",
      license: meta.LicenseShortName?.value || "Check license",
    };
  }).filter(item => {
    if (/^LL-|pronunciation|wiktionary/i.test(item.title || "")) return false;
    if (!(/^(audio\/|application\/ogg)/.test(item.mime || "")) || !item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query)).slice(0, 8);
  searchCache.set(`commons:${cacheKey}`, { value, expiresAt: Date.now() + PREVIEW_TTL });
  return value;
}

function decodeHtml(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function relevanceScore(item, query) {
  const title = String(item.title || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const phrase = query.toLowerCase().trim();
  const tokens = phrase.split(/\s+/).filter(token => token.length > 1);
  return (title.includes(phrase) ? 20 : 0) + tokens.reduce((score, token) => score + (title.includes(token) ? 4 : 0), 0);
}

function mixkitCategory(query) {
  const rules = [
    ["whoosh", /whoosh|swoosh|swish|transition/], ["impact", /impact|hit|slam|thud/],
    ["game", /game|gaming|arcade/], ["technology", /technology|computer|robot|digital|glitch/],
    ["nature", /nature|rain|wind|forest|water|thunder/], ["warfare", /gun|weapon|war|explosion|shot/],
    ["human", /human|crowd|voice|laugh|footstep/], ["animals", /animal|dog|cat|bird/],
    ["instrument", /instrument|drum|guitar|piano/], ["lifestyle", /car|vehicle|door|room|city/],
  ];
  return rules.find(([, pattern]) => pattern.test(query.toLowerCase()))?.[0] || null;
}

async function searchMixkitAudio(query) {
  const category = mixkitCategory(query);
  if (!category) return [];
  const pageUrl = `https://mixkit.co/free-sound-effects/${category}/`;
  const response = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 Media-Gecko/0.6" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) return [];
  const html = await response.text();
  const blocks = html.split(/<div class="item-grid__item">/i).slice(1);
  return blocks.map(block => {
    const url = block.match(/data-audio-player-preview-url-value="([^"]+\.mp3[^"]*)"/i)?.[1];
    const title = decodeHtml(block.match(/item-grid-card__title[^>]*>\s*([^<]+)/i)?.[1]?.trim());
    const id = block.match(/data-audio-player-item-id-value="([^"]+)"/i)?.[1];
    if (!url || !title) return null;
    return { id: `mixkit-${id}`, title, url, previewUrl: url, pageUrl, mime: "audio/mpeg", size: 0, duration: 0, source: "Mixkit", license: "Mixkit Free License" };
  }).filter(Boolean).slice(0, 6);
}

async function searchArchiveAudio(query) {
  const terms = query.replace(/[^a-z0-9 ]/gi, " ").trim();
  const search = `(title:(${terms}) OR description:(${terms}) OR subject:(${terms})) AND (subject:("sound effects") OR title:("sound effects") OR title:(SFX)) AND mediatype:(audio)`;
  const params = new URLSearchParams({ q: search, rows: "6", page: "1", output: "json" });
  for (const field of ["identifier", "title", "downloads"]) params.append("fl[]", field);
  const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, { headers: { "User-Agent": "Media-Gecko/0.6" }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) return [];
  const docs = (await response.json()).response?.docs || [];
  const results = await Promise.all(docs.slice(0, 5).map(async doc => {
    try {
      const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, { signal: AbortSignal.timeout(5000) });
      const metadata = await metadataResponse.json();
      const files = (metadata.files || []).filter(file => /\.(mp3|ogg|wav)$/i.test(file.name || "") && Number(file.size || 0) > 0 && Number(file.size) <= 40 * 1024 * 1024);
      const file = files.find(item => /\.mp3$/i.test(item.name) && !/_vbr\.mp3$/i.test(item.name)) || files[0];
      if (!file) return null;
      const url = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name).replace(/%2F/g, "/")}`;
      return { id: `archive-${doc.identifier}`, title: doc.title || file.name, url, previewUrl: url, pageUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`, mime: /\.mp3$/i.test(file.name) ? "audio/mpeg" : /\.ogg$/i.test(file.name) ? "audio/ogg" : "audio/wav", size: Number(file.size), duration: 0, popularity: Number(doc.downloads || 0), source: "Internet Archive", license: metadata.metadata?.licenseurl ? "Source license" : "Check item rights" };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

async function searchOpenverseAudio(query) {
  const params = new URLSearchParams({ q: query, page_size: "5" });
  const response = await fetch(`https://api.openverse.org/v1/audio/?${params}`, { headers: { "User-Agent": "Media-Gecko/0.6", Accept: "application/json" }, signal: AbortSignal.timeout(2200) });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || []).map(item => ({ id: `openverse-${item.id}`, title: item.title || "Openverse audio", url: item.url, previewUrl: item.url, pageUrl: item.foreign_landing_url, mime: "audio/mpeg", size: 0, duration: Number(item.duration || 0), source: "Openverse", license: [item.license, item.license_version].filter(Boolean).join(" ").toUpperCase() || "Open license" })).filter(item => /^https:\/\//.test(item.url || ""));
}

async function searchAllAudio(query) {
  const cacheKey = `all-audio:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const settled = await Promise.allSettled([searchCommonsAudio(query), searchArchiveAudio(query), searchMixkitAudio(query), searchOpenverseAudio(query)]);
  const groups = settled.map(result => result.status === "fulfilled" ? result.value : []);
  const output = [];
  const seen = new Set();
  for (let index = 0; output.length < 20; index++) {
    let added = false;
    for (const group of groups) {
      const item = group[index];
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      approvedOnlineUrls.add(item.url);
      output.push(item);
      added = true;
    }
    if (!added) break;
  }
  searchCache.set(cacheKey, { value: output, expiresAt: Date.now() + PREVIEW_TTL });
  return output;
}

async function searchCommonsImages(query, mode) {
  const transparent = mode === "transparent";
  const tokens = query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const stop = new Set(["cinematic", "realistic", "high", "quality", "image", "photo", "picture", "transparent", "png", "background"]);
  const core = tokens.filter(token => !stop.has(token)).join(" ") || query;
  const modeTerms = { gif:"animated GIF", large:"high resolution", icon:"icon", photo:"photo" };
  const searches = transparent ? [`${core} PNG`, `${core} transparent`] : [`${query} ${modeTerms[mode] || ""}`.trim()];
  const pages = (await Promise.all(searches.map(async search => {
    const params = new URLSearchParams({ action: "query", format: "json", origin: "*", generator: "search", gsrsearch: search, gsrnamespace: "6", gsrlimit: "30", prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: "480" });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": "Media-Gecko/0.6" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return [];
    return Object.values((await response.json()).query?.pages || {});
  }))).flat();
  const seen = new Set();
  return pages.map(page => {
    const info = page.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    return { index: page.pageid, thumbnail: info.thumburl || info.url, originalUrl: info.url, mime: info.mime, title: page.title?.replace(/^File:/, "").replace(/\.[^.]+$/, "") || "Image", width: Number(info.width || 0), height: Number(info.height || 0), sourceUrl: info.descriptionurl, provider: "Wikimedia Commons", license: meta.LicenseShortName?.value || "Check license", transparent: info.mime === "image/png" };
  }).filter(item => /image\/(png|jpeg|webp|gif)/.test(item.mime || "") && item.thumbnail && (!transparent || item.transparent) && !seen.has(item.originalUrl) && seen.add(item.originalUrl)).sort((a, b) => relevanceScore(b, core) - relevanceScore(a, core)).slice(0, 24);
}

async function searchOpenverseImages(query, mode) {
  const transparent = mode === "transparent";
  const search = mode === "photo" ? `${query} photograph` : mode === "icon" ? `${query} illustration icon` : transparent ? `${query} transparent PNG` : query;
  const params = new URLSearchParams({ q: search, page_size: "30", mature: "false" });
  if (transparent) params.set("extension", "png");
  if (mode === "large") params.set("size", "large");
  const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: { "User-Agent": "Media-Gecko/1.4", Accept: "application/json" }, signal: AbortSignal.timeout(5500) });
  if (!response.ok) return [];
  const data = await response.json();
  const seen = new Set();
  return (data.results || []).map(item => ({
    index: `openverse-${item.id}`,
    thumbnail: item.thumbnail || item.url,
    originalUrl: item.url,
    title: item.title || "Open image",
    width: Number(item.width || 0), height: Number(item.height || 0),
    sourceUrl: item.foreign_landing_url || item.detail_url || "",
    provider: "Openverse",
    license: [item.license, item.license_version].filter(Boolean).join(" ").toUpperCase() || "Open license",
    creator: item.creator || "",
    transparent: transparent || /\.png(?:$|\?)/i.test(item.url || ""),
  })).filter(item => /^https:\/\//.test(item.thumbnail || "") && /^https:\/\//.test(item.originalUrl || "") && !seen.has(item.originalUrl) && seen.add(item.originalUrl))
    .sort((a, b) => (relevanceScore(b, query) - relevanceScore(a, query)) || ((b.width * b.height) - (a.width * a.height))).slice(0, 24);
}

async function searchQualityImages(query, mode) {
  const settled = await Promise.allSettled([searchOpenverseImages(query, mode), searchCommonsImages(query, mode)]);
  const groups = settled.map(result => result.status === "fulfilled" ? result.value : []);
  const output = [], seen = new Set();
  for (let index = 0; output.length < 36; index++) {
    let added = false;
    for (const group of groups) {
      const item = group[index];
      const key = item?.originalUrl || item?.thumbnail;
      if (!item || seen.has(key)) continue;
      seen.add(key); output.push(item); added = true;
    }
    if (!added) break;
  }
  return output;
}

function approveOnlineResults(items) {
  for (const item of items) if (/^https:\/\//.test(item.url || "")) approvedOnlineUrls.add(item.url);
  return items;
}

function validateMediaUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || "").trim()); } catch { throw new Error("Enter a valid media URL."); }
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS media URLs are supported.");
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const supported = host === "youtube.com" || host === "youtu.be" || host === "instagram.com" || host.endsWith(".instagram.com") || host === "tiktok.com" || host.endsWith(".tiktok.com");
  if (!supported) throw new Error("Unsupported URL. Use public Instagram, TikTok, or YouTube media.");
  return parsed.href;
}

async function analyzeMediaUrl(value) {
  const sourceUrl = validateMediaUrl(value);
  const { stdout } = await run(tool("yt-dlp"), ["--dump-single-json", "--no-playlist", "--no-warnings", sourceUrl], 120000);
  const data = JSON.parse(stdout);
  const formats = (data.formats || []).filter(item => item.vcodec && item.vcodec !== "none");
  const qualities = [...new Set(formats.map(item => Number(item.height || 0)).filter(Boolean))].sort((a, b) => b - a).slice(0, 8).map(height => `${height}p`);
  const best = formats.sort((a, b) => (Number(b.height || 0) - Number(a.height || 0)) || (Number(b.tbr || 0) - Number(a.tbr || 0)))[0] || {};
  const host = new URL(sourceUrl).hostname;
  const platform = /instagram/i.test(data.extractor_key || host) ? "Instagram" : /tiktok/i.test(data.extractor_key || host) ? "TikTok" : "YouTube";
  return {
    url: sourceUrl, platform, title: data.title || data.description?.slice(0, 100) || `${platform} media`, thumbnail: data.thumbnail || data.thumbnails?.at(-1)?.url || "",
    duration: Number(data.duration || 0), width: Number(best.width || data.width || 0), height: Number(best.height || data.height || 0), fps: Number(best.fps || data.fps || 0),
    size: Number(best.filesize || best.filesize_approx || 0), qualities,
  };
}

async function downloadMediaUrl(value, format, quality, job) {
  const sourceUrl = validateMediaUrl(value);
  const safeFormat = format === "mp3" ? "mp3" : "mp4";
  const output = path.join(DOWNLOAD_DIR, "%(extractor)s", "%(title).160B [%(id)s].%(ext)s");
  const args = ["--newline", "--no-playlist", "--ffmpeg-location", TOOLS_DIR, "--output", output, "--print", "after_move:filepath"];
  if (safeFormat === "mp3") args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--embed-metadata", "--embed-thumbnail");
  else {
    const height = ["720", "1080"].includes(String(quality)) ? String(quality) : null;
    args.push("-f", height ? `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]` : "bestvideo+bestaudio/best", "--merge-output-format", "mp4", "--embed-metadata", "--embed-thumbnail");
  }
  args.push(sourceUrl);
  const startedAt = Date.now();
  const result = await run(tool("yt-dlp"), args, 15 * 60 * 1000, job);
  let file = result.stdout.trim().split(/\r?\n/).at(-1)?.trim();
  if (!file || !fs.existsSync(file)) {
    const pending = [DOWNLOAD_DIR];
    const candidates = [];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(target);
        else if (entry.isFile() && path.extname(target).toLowerCase() === `.${safeFormat}`) {
          const stats = fs.statSync(target);
          candidates.push({ path: target, time: stats.mtimeMs, recent: stats.mtimeMs >= startedAt - 3000 });
        }
      }
    }
    file = candidates.sort((a, b) => Number(b.recent) - Number(a.recent) || b.time - a.time)[0]?.path;
  }
  if (!file || !fs.existsSync(file)) throw new Error("Downloaded media file was not found.");
  return library.addFile(file, { source: new URL(sourceUrl).hostname });
}

function cacheFiles(directory = CACHE_DIR) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) { const stats = fs.statSync(target); files.push({ path: target, size: stats.size, time: stats.mtimeMs }); }
    }
  }
  return files;
}

function enforceCacheLimit() {
  if (process.env.MEDIA_GECKO_AUTO_CLEANUP === "false") return;
  const limit = Number(process.env.MEDIA_GECKO_CACHE_LIMIT_BYTES || 5 * 1024 ** 3);
  if (!limit) return;
  const files = cacheFiles().sort((a, b) => a.time - b.time);
  let total = files.reduce((sum, item) => sum + item.size, 0);
  for (const item of files) {
    if (total <= limit) break;
    try { fs.unlinkSync(item.path); total -= item.size; } catch {}
  }
}

async function downloadYouTube(sourceUrl, format, quality, job) {
  const safeFormat = format === "mp4" ? "mp4" : "mp3";
  const output = path.join(DOWNLOAD_DIR, "%(title).160B [%(id)s].%(ext)s");
  const args = ["--newline", "--no-playlist", "--ffmpeg-location", TOOLS_DIR, "--output", output, "--print", "after_move:filepath"];
  if (safeFormat === "mp3") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "--embed-metadata");
  } else {
    const heights = { "480": "480", "720": "720", "1080": "1080" };
    const height = heights[String(quality)] || "1080";
    args.push("-f", `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`, "--merge-output-format", "mp4", "--embed-metadata");
  }
  args.push(sourceUrl);
  const result = await run(tool("yt-dlp"), args, 15 * 60 * 1000, job);
  const file = result.stdout.trim().split(/\r?\n/).at(-1);
  if (!file || !fs.existsSync(file)) throw new Error("Downloaded media file was not found.");
  return library.addFile(file, { source: "youtube" });
}

async function cacheOnlineSound(sourceUrl, title, source) {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || !approvedOnlineUrls.has(sourceUrl)) throw new Error("Search this sound again before caching it.");
  const response = await fetch(parsed);
  if (!response.ok) throw new Error("Online sound download failed.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 80 * 1024 * 1024) throw new Error("Online sound exceeds 80 MB cache limit.");
  const type = (response.headers.get("content-type") || "").split(";")[0];
  const extension = path.extname(parsed.pathname).toLowerCase() || ({ "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav" }[type] || ".mp3");
  const safeName = String(title || "online-sfx").replace(/[<>:"/\\|?*]+/g, " ").trim().slice(0, 100);
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 10);
  const directory = path.join(CACHE_DIR, "audio");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${safeName} [${hash}]${extension}`);
  if (!fs.existsSync(file)) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 80 * 1024 * 1024) throw new Error("Online sound exceeds 80 MB cache limit.");
    fs.writeFileSync(file, bytes);
  }
  enforceCacheLimit();
  return library.addFile(file, { name: safeName, source: source || parsed.hostname, remoteUrl: sourceUrl });
}

async function downloadOnlineSound(sourceUrl, title, source) {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || !approvedOnlineUrls.has(sourceUrl)) throw new Error("Search this sound again before downloading it.");
  const response = await fetch(parsed);
  if (!response.ok) throw new Error("Online sound download failed.");
  const type = (response.headers.get("content-type") || "").split(";")[0];
  const extension = path.extname(parsed.pathname).toLowerCase() || ({ "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/wav": ".wav" }[type] || ".mp3");
  if (![".mp3", ".wav", ".ogg", ".opus", ".m4a", ".aac", ".flac"].includes(extension)) throw new Error("Unsupported sound format.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 80 * 1024 * 1024) throw new Error("Online sound exceeds 80 MB limit.");
  const directory = path.join(DOWNLOAD_DIR, "SFX");
  fs.mkdirSync(directory, { recursive: true });
  const safeName = String(title || "online-sfx").replace(/[<>:"/\\|?*]+/g, " ").trim().slice(0, 100) || "online-sfx";
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 10);
  const file = path.join(directory, `${safeName} [${hash}]${extension}`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  return library.addFile(file, { name: safeName, source: source || parsed.hostname, remoteUrl: sourceUrl });
}

const mimeTypes = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".opus": "audio/ogg",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp", ".avif": "image/avif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
};

function serveLibraryFile(req, res, asset) {
  if (!asset || !fs.existsSync(asset.path)) return sendJson(res, 404, { error: "Asset file missing." });
  const stats = fs.statSync(asset.path);
  const range = req.headers.range;
  const type = mimeTypes[path.extname(asset.path).toLowerCase()] || "application/octet-stream";
  if (range) {
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : stats.size - 1;
    if (!Number.isFinite(start) || start < 0 || end >= stats.size) return res.writeHead(416).end();
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stats.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": type });
    return fs.createReadStream(asset.path, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Length": stats.size, "Content-Type": type, "Accept-Ranges": "bytes" });
  fs.createReadStream(asset.path).pipe(res);
}

function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end("Not found");
  res.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/download-events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      downloadClients.add(res);
      for (const job of downloadJobs.values()) res.write(`data: ${JSON.stringify({ ...job, child: undefined })}\n\n`);
      req.on("close", () => downloadClients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/download-cancel") {
      const job = downloadJobs.get(url.searchParams.get("id"));
      if (job?.child) job.child.kill();
      if (job) updateJob(job, { state: "cancelled", error: "Cancelled", finishedAt: Date.now() });
      return sendJson(res, 200, { ok: Boolean(job) });
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ytDlp: fs.existsSync(path.join(TOOLS_DIR, "yt-dlp.exe")), ffmpeg: fs.existsSync(path.join(TOOLS_DIR, "ffmpeg.exe")), downloadDir: DOWNLOAD_DIR, libraryRecovery: library.getRecoveryInfo?.() || null });
    }
    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim().slice(0, 160);
      const source = url.searchParams.get("source") || "youtube";
      if (!query) return sendJson(res, 400, { error: "Enter a search term." });
      const youtube = source === "youtube" ? await searchYouTube(query) : [];
      return sendJson(res, 200, { youtube, libraries: soundLibraries(query), imageLibraries: imageLibraries(query) });
    }
    if (req.method === "GET" && url.pathname === "/api/online-sfx") {
      const query = (url.searchParams.get("q") || "").trim().slice(0, 160);
      if (!query) return sendJson(res, 400, { error: "Enter a search term." });
      const source = url.searchParams.get("source") || "all";
      const searchers = { commons: searchCommonsAudio, archive: searchArchiveAudio, mixkit: searchMixkitAudio, openverse: searchOpenverseAudio };
      const results = source === "all" ? await searchAllAudio(query) : await (searchers[source] || searchCommonsAudio)(query);
      return sendJson(res, 200, { results: approveOnlineResults(results), source });
    }
    if (req.method === "GET" && url.pathname === "/api/image-search") {
      const query = (url.searchParams.get("q") || "").trim().slice(0, 160);
      if (!query) return sendJson(res, 400, { error: "Enter a search term." });
      const requestedMode = url.searchParams.get("mode") || "transparent";
      const mode = ["transparent","normal","gif","large","icon","photo"].includes(requestedMode) ? requestedMode : "transparent";
      return sendJson(res, 200, { results: await searchQualityImages(query, mode), mode });
    }
    if (req.method === "GET" && url.pathname === "/api/youtube-preview") {
      const mediaUrl = await youtubePreviewUrl(url.searchParams.get("url") || "");
      res.writeHead(302, { Location: mediaUrl, "Cache-Control": "private, max-age=300" });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/api/youtube-video-preview") {
      const file = await youtubeVideoPreviewUrl(url.searchParams.get("url") || "");
      return serveLibraryFile(req, res, { path: file });
    }
    if (req.method === "POST" && url.pathname === "/api/youtube-prewarm") {
      const body = await readBody(req);
      const urls = Array.isArray(body.urls) ? body.urls.slice(0, 4) : [];
      sendJson(res, 202, { ok: true });
      for (const sourceUrl of urls) youtubePreviewUrl(sourceUrl).catch(() => {});
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/youtube-video-prewarm") {
      const body = await readBody(req);
      const urls = Array.isArray(body.urls) ? body.urls.slice(0, 2) : [];
      sendJson(res, 202, { ok: true });
      for (const sourceUrl of urls) youtubeVideoPreviewUrl(sourceUrl).catch(() => {});
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/library") return sendJson(res, 200, { assets: library.list() });
    if (req.method === "GET" && url.pathname === "/api/library/file") return serveLibraryFile(req, res, library.get(url.searchParams.get("id")));
    if (req.method === "POST" && url.pathname === "/api/download") {
      const body = await readBody(req);
      if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(body.url || "")) return sendJson(res, 400, { error: "Only YouTube search URLs are accepted." });
      const job = beginJob(body.jobId, `YouTube ${String(body.format || "mp3").toUpperCase()}`);
      try { const asset = await downloadYouTube(body.url, body.format, body.quality, job); updateJob(job, { state: "complete", percent: 100, assetId: asset.id, finishedAt: Date.now() }); return sendJson(res, 200, { ok: true, asset }); }
      catch (error) { updateJob(job, { state: "failed", error: cleanError(error), finishedAt: Date.now() }); throw error; }
    }
    if (req.method === "POST" && url.pathname === "/api/analyze-url") {
      const body = await readBody(req);
      return sendJson(res, 200, await analyzeMediaUrl(body.url));
    }
    if (req.method === "POST" && url.pathname === "/api/download-url") {
      const body = await readBody(req);
      const job = beginJob(body.jobId, `Social ${String(body.format || "mp4").toUpperCase()}`);
      try { const asset = await downloadMediaUrl(body.url, body.format, body.quality, job); updateJob(job, { state: "complete", percent: 100, assetId: asset.id, finishedAt: Date.now() }); return sendJson(res, 200, { ok: true, asset }); }
      catch (error) { updateJob(job, { state: "failed", error: cleanError(error), finishedAt: Date.now() }); throw error; }
    }
    if (req.method === "POST" && url.pathname === "/api/cache-online") {
      const body = await readBody(req);
      const job = beginJob(body.jobId, body.title || "Prepare SFX");
      try { const asset = await cacheOnlineSound(body.url, body.title, body.source); updateJob(job, { state: "complete", percent: 100, assetId: asset.id, finishedAt: Date.now() }); return sendJson(res, 200, { ok: true, asset }); }
      catch (error) { updateJob(job, { state: "failed", error: cleanError(error), finishedAt: Date.now() }); throw error; }
    }
    if (req.method === "POST" && url.pathname === "/api/download-online") {
      const body = await readBody(req);
      const job = beginJob(body.jobId, body.title || "SFX download");
      try { const asset = await downloadOnlineSound(body.url, body.title, body.source); updateJob(job, { state: "complete", percent: 100, assetId: asset.id, finishedAt: Date.now() }); return sendJson(res, 200, { ok: true, asset }); }
      catch (error) { updateJob(job, { state: "failed", error: cleanError(error), finishedAt: Date.now() }); throw error; }
    }
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: cleanError(error) });
  }
});

let readyResolve;
let readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
server.once("error", readyReject);
server.listen(PORT, "127.0.0.1", () => {
  const activePort = server.address().port;
  console.log(`Media Gecko running at http://127.0.0.1:${activePort}`);
  readyResolve(activePort);
});

module.exports = { DOWNLOAD_DIR, ready, server };
