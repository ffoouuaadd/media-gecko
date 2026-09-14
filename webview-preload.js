const { ipcRenderer } = require("electron");
const readyImages = new Set();
let mouseDown = false;
let pendingDrag = null;

function imageCandidate(target) {
  const image = target?.closest?.("img") || (target?.tagName === "IMG" ? target : null);
  if (!image) return null;
  let url = image.currentSrc || image.src;
  if (!/^https:\/\//i.test(url || "")) return null;
  try {
    const linked = new URL(image.closest("a[href]")?.href || url);
    const candidate = linked.searchParams.get("imgurl") || linked.searchParams.get("mediaurl");
    if (candidate && /^https:\/\//i.test(candidate)) url = candidate;
    else if (/\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(linked.href)) url = linked.href;
  } catch {}
  return { url, title: image.alt || image.title || document.title || "Browser image" };
}

document.addEventListener("mousedown", event => {
  if (event.button !== 0) return;
  const image = imageCandidate(event.target);
  if (image) {
    mouseDown = true;
    ipcRenderer.send("browser-image-action", { action: "prepare", ...image });
  }
}, true);
document.addEventListener("mouseup", () => { mouseDown = false; pendingDrag = null; }, true);

document.addEventListener("dragstart", event => {
  const image = imageCandidate(event.target);
  if (!image) return;
  event.preventDefault();
  if (!readyImages.has(image.url)) {
    pendingDrag = image;
    ipcRenderer.sendToHost("browser-image-status", "Preparing full image. Keep holding to drag.");
    return;
  }
  ipcRenderer.send("browser-image-action", { action: "drag", ...image });
}, true);

ipcRenderer.on("browser-image-result", (_event, result) => {
  if (result.ok && result.url) readyImages.add(result.url);
  if (result.ok && result.action === "prepare") {
    if (mouseDown && pendingDrag?.url === result.url) {
      const image = pendingDrag;
      pendingDrag = null;
      ipcRenderer.send("browser-image-action", { action: "drag", ...image });
      return;
    }
    ipcRenderer.sendToHost("browser-image-status", `${result.name} ready to drag.`);
    return;
  }
  const message = result.ok
    ? result.action === "drag" ? `${result.name} ready for drop.` : `${result.name} ${result.action === "save" ? "saved to library." : result.action === "copy" ? "copied." : "ready."}`
    : result.error || "Browser image action failed.";
  ipcRenderer.sendToHost("browser-image-status", message);
});
