const query = document.getElementById("mini-query");
const results = document.getElementById("mini-results");
const audio = document.getElementById("mini-audio");
let items = [], filter = "", selected = 0, timer, searchSerial = 0;
try { const settings = JSON.parse(localStorage.getItem("media-gecko-settings") || "{}"); document.documentElement.style.setProperty("--accent", settings.colors?.primary || "#ff4e18"); document.documentElement.style.setProperty("--selection", settings.colors?.selection || "#5a3023"); document.documentElement.style.setProperty("--icon", settings.colors?.icon || "#ef8e6a"); document.body.dataset.appearance=settings.appearance||"dark"; } catch {}
const escapeHtml = value => String(value || "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
function visibleItems() { return items.filter(item => !filter || (filter === "recent" ? item.subtitle?.includes("RECENT") : item.type === filter || item.kind === filter)); }
function render() {
  const visible = visibleItems();
  results.innerHTML = visible.length ? visible.map((item, index) => `<article class="mini-result${index === selected ? " active" : ""}" data-index="${index}" ${item.assetId ? `draggable="true" data-asset-id="${item.assetId}"` : ""}><mark>${escapeHtml(item.type)}</mark><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.subtitle)}</span></div><i>${item.assetId ? "DRAG" : "OPEN"}</i></article>`).join("") : "<p>No matching assets.</p>";
  document.getElementById("mini-count").textContent = `${visible.length} RESULTS`;
}
function unique(values){const seen=new Set();return values.filter(item=>{const key=item.assetId||item.previewUrl||item.url||`${item.type}:${item.label}`;if(seen.has(key))return false;seen.add(key);return true;});}
async function search() {
  const serial=++searchSerial,term=query.value.trim();
  document.getElementById("mini-count").textContent="SEARCHING";
  try { items=await window.desktop.universalSearch(term); } catch { items=[]; }
  if(serial!==searchSerial)return;selected=0;render();
  if(term.length<2)return;
  const onlineSfx=fetch(`/api/online-sfx?q=${encodeURIComponent(term)}`).then(response=>response.ok?response.json():{results:[]}).then(data=>(data.results||[]).slice(0,8).map(item=>({type:"SFX",kind:"audio",label:item.title||item.name||"Online sound",subtitle:`${item.source||"Online"} · Internet`,previewUrl:item.previewUrl||item.preview||item.url,url:item.pageUrl||item.sourceUrl||item.url,view:"browser"}))).catch(()=>[]);
  const onlineImages=window.desktop.searchGoogleImages(term,"normal").then(values=>(values||[]).slice(0,8).map(item=>({type:"IMAGE",kind:"image",label:item.title||"Online image",subtitle:`${item.sourceDomain||item.source||item.site||"Google Images"} · Internet`,previewUrl:item.original||item.url||item.thumbnail,sourceUrl:item.sourceUrl||item.pageUrl||item.original||item.url,query:term,view:"pngsources"}))).catch(()=>[]);
  const [sounds,images]=await Promise.all([onlineSfx,onlineImages]);
  if(serial!==searchSerial)return;items=unique([...items,...sounds,...images]);render();
}
query.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 160); });
document.getElementById("mini-filters").addEventListener("click", event => { const button = event.target.closest("[data-filter]"); if (!button) return; filter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button)); selected = 0; render(); });
results.addEventListener("pointerover", event => { const card=event.target.closest(".mini-result"); if(!card||card.contains(event.relatedTarget))return; const item = visibleItems()[Number(card.dataset.index)]; if (item?.kind === "audio" && item.previewUrl) { audio.src = item.previewUrl; audio.play().catch(() => {}); } if(item?.kind === "image"&&item.previewUrl) window.desktop.showMiniImagePreview({url:item.previewUrl,title:item.label,subtitle:item.subtitle,offsetY:card.offsetTop-results.scrollTop}); });
results.addEventListener("pointerout", event => { const card=event.target.closest(".mini-result"); if(!card||card.contains(event.relatedTarget))return; audio.pause(); audio.removeAttribute("src"); window.desktop.hideMiniImagePreview(); });
results.addEventListener("click", event => { const item = visibleItems()[Number(event.target.closest(".mini-result")?.dataset.index)]; if (item) window.desktop.showMainResult(item); });
results.addEventListener("dragstart", event => { const card = event.target.closest("[data-asset-id]"); if (!card) return event.preventDefault(); event.preventDefault(); window.desktop.startDrag(card.dataset.assetId); });
document.addEventListener("keydown", event => { const visible = visibleItems(); if (event.key === "Escape") { window.desktop.hideMiniImagePreview(); window.desktop.hideMini(); } if (event.key === "ArrowDown") { event.preventDefault(); selected = Math.min(visible.length - 1, selected + 1); render(); } if (event.key === "ArrowUp") { event.preventDefault(); selected = Math.max(0, selected - 1); render(); } if (event.key === "Enter" && visible[selected]) window.desktop.showMainResult(visible[selected]); });
window.desktop.onMiniFocus(() => { query.focus(); query.select(); search(); });
query.focus(); search();
