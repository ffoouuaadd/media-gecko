const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const library = require("../library-store");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-gecko-scale-"));
try {
  const media = path.join(root, "media");
  fs.mkdirSync(media);
  for (let index = 0; index < 10000; index++) {
    const category = index % 4 === 0 ? "whoosh" : index % 4 === 1 ? "impact" : index % 4 === 2 ? "glitch" : "ambient";
    fs.writeFileSync(path.join(media, `${category}-${String(index).padStart(5, "0")}.mp3`), "");
  }
  library.configure(path.join(root, "db"));
  const importStart = performance.now();
  const imported = library.importPaths([media]);
  const importMs = Math.round(performance.now() - importStart);
  const searchStart = performance.now();
  const search = library.search("whoosh", { limit: 60 });
  const searchMs = Math.round((performance.now() - searchStart) * 100) / 100;
  const pageStart = performance.now();
  const page = library.list({ limit: 100, offset: 9000 });
  const pageMs = Math.round((performance.now() - pageStart) * 100) / 100;
  const result = { count: library.count(), added: imported.added.length, importMs, searchMs, pageMs, searchResults: search.length, pageResults: page.length };
  console.log(JSON.stringify(result));
  if (result.count !== 10000 || result.added !== 10000 || result.searchResults !== 60 || result.pageResults !== 100 || searchMs > 250 || pageMs > 250) process.exitCode = 1;
} finally {
  library.close();
  if (root.startsWith(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true });
}
