const image = document.getElementById("preview-image");
const title = document.getElementById("preview-title");
const subtitle = document.getElementById("preview-subtitle");
try { const settings=JSON.parse(localStorage.getItem("media-gecko-settings")||"{}"); document.documentElement.style.setProperty("--accent",settings.colors?.primary||"#ff4e18"); document.body.dataset.appearance=settings.appearance||"dark"; } catch {}
window.desktop.onMiniPreview(item => { image.src=item.url; title.textContent=item.title; subtitle.textContent=item.subtitle; });
