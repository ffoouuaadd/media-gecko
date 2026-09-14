const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
const SUPPORTED_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const CATEGORY_RULES = [
  ["Whooshes", /whoosh|swoosh|swish|flyby|pass.?by/], ["Impacts", /impact|slam|crash|collision|thud/], ["Hits", /\bhit\b|punch|kick|smack|strike/],
  ["Risers", /riser|rise|uplift|build.?up/], ["Downers", /downer|drop|fall|descend/], ["Glitches", /glitch|stutter|digital.?error|corrupt/],
  ["UI / Interface", /\bui\b|interface|button|click|notification|menu|toggle|beep/], ["Transitions", /transition|sweep|reveal|wipe/],
  ["Ambience", /ambience|ambient|atmosphere|room.?tone|background/], ["Nature", /nature|rain|wind|thunder|water|ocean|forest|bird|animal/],
  ["Vehicles", /vehicle|car|truck|engine|motor|train|plane|aircraft|bike/], ["Weapons", /weapon|gun|shot|rifle|pistol|sword|explosion|ammo/],
  ["Footsteps", /footstep|steps|walking|running|shoe/], ["Crowd", /crowd|cheer|applause|audience|people|stadium/],
  ["Technology", /technology|computer|robot|machine|electric|cyber|sci.?fi/], ["Gaming", /gaming|game|arcade|level.?up|power.?up|coin|achievement/],
  ["Comedy / Meme", /comedy|funny|meme|vine|cartoon|boing|bonk|fart/], ["Cinematic", /cinematic|trailer|braam|epic|tension|drone/],
];

let database;
let storageDirectory;
let recoveryInfo = null;

function kindFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}
function categoryFor(file, kind) {
  if (kind === "image") return "Images";
  if (kind === "video") return "Video";
  const searchable = path.basename(file, path.extname(file)).toLowerCase().replace(/[_-]+/g, " ");
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(searchable))?.[0] || "Other";
}
function normalize(file) { return path.resolve(file).toLowerCase(); }
function rowToAsset(row) {
  if (!row) return null;
  return { id: row.id, path: row.path, name: row.name, extension: row.extension, kind: row.kind, category: row.category, tags: JSON.parse(row.tags || "[]"), favorite: Boolean(row.favorite), source: row.source, remoteUrl: row.remote_url || "", size: Number(row.size || 0), modifiedAt: Number(row.modified_at || 0), addedAt: Number(row.added_at || 0), duration: Number(row.duration || 0), width: Number(row.width || 0), height: Number(row.height || 0), lastUsed: Number(row.last_used || 0), hash: row.hash || "" };
}
function ensureDatabase() {
  if (!database) throw new Error("Library store is not configured.");
}
function isConfigured() { return Boolean(database); }
function close() { if (database) { try { database.close(); } finally { database = null; } } }
function configure(directory) {
  if (database) { try { database.close(); } catch {} }
  storageDirectory = directory;
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "library.sqlite");
  database = new DatabaseSync(file);
  try {
    const check = database.prepare("PRAGMA quick_check").get();
    if (check?.quick_check !== "ok") throw new Error(check?.quick_check || "SQLite integrity check failed.");
  } catch (error) {
    try { database.close(); } catch {}
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${file}.corrupt-${stamp}`;
    for (const suffix of ["", "-wal", "-shm"]) {
      const source = `${file}${suffix}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${backup}${suffix}`);
    }
    recoveryInfo = { backup, message: "Corrupted library index was backed up and rebuilt. Original media files were not changed." };
    database = new DatabaseSync(file);
  }
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, extension TEXT NOT NULL,
      kind TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', favorite INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'local', remote_url TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0,
      modified_at REAL NOT NULL DEFAULT 0, added_at REAL NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, last_used REAL NOT NULL DEFAULT 0, hash TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS assets_name ON assets(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS assets_kind ON assets(kind);
    CREATE INDEX IF NOT EXISTS assets_category ON assets(category COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS assets_added ON assets(added_at DESC);
    CREATE INDEX IF NOT EXISTS assets_used ON assets(last_used DESC);
    CREATE INDEX IF NOT EXISTS assets_favorite ON assets(favorite);
    CREATE INDEX IF NOT EXISTS assets_size ON assets(size);
  `);
  migrateJson();
}
function getRecoveryInfo() { return recoveryInfo; }
function migrateJson() {
  const legacy = path.join(storageDirectory, "library.json");
  const marker = `${legacy}.migrated`;
  if (!fs.existsSync(legacy) || fs.existsSync(marker)) return;
  try {
    const state = JSON.parse(fs.readFileSync(legacy, "utf8"));
    database.exec("BEGIN");
    for (const asset of state.assets || []) insertAsset(asset, true);
    database.exec("COMMIT");
    fs.writeFileSync(marker, new Date().toISOString());
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
}
function insertAsset(asset, ignore = false) {
  const sql = `${ignore ? "INSERT OR IGNORE" : "INSERT"} INTO assets (id,path,normalized_path,name,extension,kind,category,tags,favorite,source,remote_url,size,modified_at,added_at,duration,width,height,last_used,hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  database.prepare(sql).run(asset.id, asset.path, normalize(asset.path), asset.name, asset.extension, asset.kind, asset.category, JSON.stringify(asset.tags || []), asset.favorite ? 1 : 0, asset.source || "local", asset.remoteUrl || "", asset.size || 0, asset.modifiedAt || 0, asset.addedAt || Date.now(), asset.duration || 0, asset.width || 0, asset.height || 0, asset.lastUsed || 0, asset.hash || "");
}
function addFile(file, options = {}) {
  ensureDatabase();
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  const kind = kindFor(absolute);
  if (!kind) return null;
  const existing = rowToAsset(database.prepare("SELECT * FROM assets WHERE normalized_path=?").get(normalize(absolute)));
  if (existing) {
    if (options.remoteUrl && !existing.remoteUrl) update(existing.id, { remoteUrl: options.remoteUrl });
    return get(existing.id);
  }
  const stats = fs.statSync(absolute);
  const asset = { id: crypto.randomUUID(), path: absolute, name: options.name || path.basename(absolute, path.extname(absolute)), extension: path.extname(absolute).slice(1).toLowerCase(), kind, category: options.category || categoryFor(absolute, kind), tags: Array.isArray(options.tags) ? options.tags : [], favorite: Boolean(options.favorite), source: options.source || "local", remoteUrl: options.remoteUrl || "", size: stats.size, modifiedAt: stats.mtimeMs, addedAt: Date.now(), duration: 0, width: 0, height: 0, lastUsed: 0, hash: "" };
  insertAsset(asset);
  return asset;
}
function collectFiles(inputPaths) {
  const output = [], pending = [...inputPaths];
  while (pending.length) {
    const current = pending.pop();
    if (!fs.existsSync(current)) continue;
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isSymbolicLink()) pending.push(path.join(current, entry.name));
      }
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(current).toLowerCase())) output.push(current);
  }
  return output;
}
function importPaths(paths, progress) {
  ensureDatabase();
  const files = collectFiles(paths), added = [];
  const known = new Set(database.prepare("SELECT normalized_path FROM assets").all().map(row => row.normalized_path));
  database.exec("BEGIN");
  try {
    for (let index = 0; index < files.length; index++) {
      const normalized = normalize(files[index]);
      const asset = addFile(files[index]);
      if (asset && !known.has(normalized)) { added.push(asset); known.add(normalized); }
      if (progress && (index % 100 === 0 || index === files.length - 1)) progress({ current: index + 1, total: files.length });
    }
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return { added, total: count() };
}
function count(filters = {}) {
  ensureDatabase();
  const where = [], values = [];
  if (filters.kind) { where.push("kind=?"); values.push(filters.kind); }
  if (filters.favorite) where.push("favorite=1");
  return Number(database.prepare(`SELECT COUNT(*) AS total FROM assets${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`).get(...values).total);
}
function list(options = {}) {
  ensureDatabase();
  const limit = Math.min(5000, Math.max(1, Number(options.limit || 2000))), offset = Math.max(0, Number(options.offset || 0));
  const where = [], values = [];
  if (options.kind) { where.push("kind=?"); values.push(options.kind); }
  if (options.favorite) where.push("favorite=1");
  if (options.category) { where.push("category=?"); values.push(options.category); }
  const order = { name:"name COLLATE NOCASE", oldest:"added_at", used:"last_used DESC", size:"size DESC" }[options.sort] || "added_at DESC";
  return database.prepare(`SELECT * FROM assets${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values, limit, offset).map(rowToAsset);
}
function search(query, options = {}) {
  ensureDatabase();
  const term = `%${String(query || "").trim().toLowerCase()}%`, limit = Math.min(1000, Math.max(1, Number(options.limit || 60))), offset = Math.max(0, Number(options.offset || 0));
  const where = ["(lower(name) LIKE ? OR lower(tags) LIKE ? OR lower(category) LIKE ? OR lower(path) LIKE ? OR lower(source) LIKE ?)"];
  const values = [term, term, term, term, term];
  if (options.kind) { where.push("kind=?"); values.push(options.kind); }
  if (options.favorite) where.push("favorite=1");
  if (options.category) { where.push("category=?"); values.push(options.category); }
  return database.prepare(`SELECT * FROM assets WHERE ${where.join(" AND ")} ORDER BY favorite DESC, last_used DESC, added_at DESC LIMIT ? OFFSET ?`).all(...values, limit, offset).map(rowToAsset);
}
function get(id) { ensureDatabase(); return rowToAsset(database.prepare("SELECT * FROM assets WHERE id=?").get(String(id || ""))); }
function update(id, changes = {}) {
  const asset = get(id);
  if (!asset) return null;
  const columns = [], values = [];
  const set = (column, value) => { columns.push(`${column}=?`); values.push(value); };
  if (typeof changes.name === "string" && changes.name.trim()) set("name", changes.name.trim().slice(0, 160));
  if (typeof changes.category === "string" && changes.category.trim()) set("category", changes.category.trim().slice(0, 80));
  if (Array.isArray(changes.tags)) set("tags", JSON.stringify([...new Set(changes.tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 24)));
  if (typeof changes.favorite === "boolean") set("favorite", changes.favorite ? 1 : 0);
  if (typeof changes.remoteUrl === "string") set("remote_url", changes.remoteUrl);
  for (const [key, column] of [["duration","duration"],["width","width"],["height","height"],["lastUsed","last_used"]]) if (Number.isFinite(changes[key]) && changes[key] >= 0) set(column, changes[key]);
  if (typeof changes.hash === "string") set("hash", changes.hash);
  if (columns.length) database.prepare(`UPDATE assets SET ${columns.join(",")} WHERE id=?`).run(...values, id);
  return get(id);
}
function remove(id) { ensureDatabase(); return database.prepare("DELETE FROM assets WHERE id=?").run(String(id || "")).changes > 0; }
function markUsed(id) { return update(id, { lastUsed: Date.now() }); }
function hashFile(file) { const hash = crypto.createHash("sha256"); const handle = fs.openSync(file, "r"); const buffer = Buffer.allocUnsafe(1024 * 1024); try { let read; while ((read = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read)); } finally { fs.closeSync(handle); } return hash.digest("hex"); }
function duplicates() {
  ensureDatabase();
  const candidates = database.prepare("SELECT size, extension, COUNT(*) AS total FROM assets GROUP BY size, extension HAVING total > 1 LIMIT 500").all();
  const groups = [];
  for (const candidate of candidates) {
    const assets = database.prepare("SELECT * FROM assets WHERE size=? AND extension=?").all(candidate.size, candidate.extension).map(rowToAsset);
    const byHash = new Map();
    for (const asset of assets) {
      if (!fs.existsSync(asset.path)) continue;
      const hash = asset.hash || hashFile(asset.path); if (!asset.hash) update(asset.id, { hash });
      if (!byHash.has(hash)) byHash.set(hash, []); byHash.get(hash).push({ ...asset, hash });
    }
    for (const [hash, matches] of byHash) if (matches.length > 1) groups.push({ hash, size: candidate.size, assets: matches });
  }
  return groups;
}
function smartFolder(name, limit = 1000) {
  ensureDatabase();
  const rules = {
    recentAdded: "added_at >= ?", recentUsed: "last_used > 0", favorites: "favorite=1", large: "size >= 104857600",
    transparent: "kind='image' AND extension='png'", videos: "kind='video'", vertical: "kind='video' AND height > width", fourK: "kind='video' AND width >= 3840", sfx: "kind='audio'", gifs: "extension='gif'", downloads: "lower(source) LIKE '%download%'", unused: "last_used=0",
  };
  const sql = rules[name] || "1=1", values = name === "recentAdded" ? [Date.now() - 30 * 86400000] : [];
  return database.prepare(`SELECT * FROM assets WHERE ${sql} ORDER BY added_at DESC LIMIT ?`).all(...values, Math.min(5000, limit)).map(rowToAsset);
}
function similar(id, limit = 30) {
  const asset = get(id); if (!asset) return [];
  if (asset.kind === "image") return database.prepare("SELECT * FROM assets WHERE kind='image' AND id<>? ORDER BY ABS(width-?) + ABS(height-?) + ABS(size-?)/1000 LIMIT ?").all(id, asset.width, asset.height, asset.size, limit).map(rowToAsset);
  const tokens = asset.name.split(/\W+/).filter(token => token.length > 2).slice(0, 3).join(" ");
  return search(tokens || asset.category, { kind: asset.kind, limit }).filter(item => item.id !== id);
}

module.exports = { configure, close, isConfigured, getRecoveryInfo, addFile, importPaths, list, count, search, get, update, remove, markUsed, duplicates, smartFolder, similar, kindFor, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS };
