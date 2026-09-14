(() => {
  const viewport = document.getElementById("board-viewport");
  const world = document.getElementById("board-world");
  const canvas = document.getElementById("board-canvas");
  if (!viewport || !window.desktop) return;

  let board = null;
  let boards = [];
  let tool = "select";
  let selected = new Set();
  let interaction = null;
  let saveTimer = 0;
  let history = [];
  let historyIndex = -1;
  let spaceDown = false;
  let boardClipboard = [];
  const boardDialog=document.getElementById("board-dialog"),boardDialogInput=document.getElementById("board-dialog-input"),boardDialogLabel=document.getElementById("board-dialog-label");let boardDialogResolve=null;
  function ask(label,value=""){if(boardDialogResolve)boardDialogResolve(null);boardDialog.hidden=false;boardDialogLabel.textContent=label;boardDialogInput.value=value;boardDialogInput.focus();boardDialogInput.select();return new Promise(resolve=>{boardDialogResolve=resolve;});}
  function closeAsk(value){boardDialog.hidden=true;const resolve=boardDialogResolve;boardDialogResolve=null;resolve?.(value);viewport.focus();}
  boardDialog.addEventListener("submit",event=>{event.preventDefault();closeAsk(boardDialogInput.value.trim());});document.getElementById("board-dialog-cancel").addEventListener("click",()=>closeAsk(null));boardDialog.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();closeAsk(null);}});

  const uid = () => crypto.randomUUID();
  const blankBoard = name => ({ id: uid(), name, updatedAt: new Date().toISOString(), background: document.body.dataset.appearance === "light" ? "#f1f2f4" : "#202020", grid: 20, snap: true, viewport: { x: -3500, y: -2600, zoom: 1 }, objects: [] });
  const clone = value => structuredClone(value);
  const snap = value => board.snap && board.grid ? Math.round(value / board.grid) * board.grid : value;
  const highestZ = () => Math.max(0, ...board.objects.map(item => item.z || 0));
  const lowestZ = () => Math.min(0, ...board.objects.map(item => item.z || 0));

  function snapshot() {
    const state = JSON.stringify({ objects: board.objects, background: board.background, grid: board.grid, snap: board.snap });
    if (history[historyIndex] === state) return;
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
  }
  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    Object.assign(board, JSON.parse(history[index]));
    selected.clear(); render(); scheduleSave();
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    const state=document.getElementById("board-save-state"); if(state) state.textContent="SAVING…";
    saveTimer = setTimeout(async () => {
      if (!board) return;
      try { board.viewport = currentViewport(); board = await window.desktop.saveBoard(board); const item = boards.find(value => value.id === board.id); if (item) Object.assign(item, { name: board.name, updatedAt: board.updatedAt }); renderBoardSelect(); if(state)state.textContent="SAVED"; }
      catch { if(state)state.textContent="SAVE FAILED"; }
    }, 280);
  }
  function currentViewport() {
    return { x: Number(board.viewport.x || 0), y: Number(board.viewport.y || 0), zoom: Number(board.viewport.zoom || 1) };
  }
  function applyViewport() {
    world.style.transform = `translate(${board.viewport.x}px,${board.viewport.y}px) scale(${board.viewport.zoom})`;
    document.getElementById("board-zoom").textContent = `${Math.round(board.viewport.zoom * 100)}%`;
  }
  function screenToWorld(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return { x: (clientX - rect.left - board.viewport.x) / board.viewport.zoom, y: (clientY - rect.top - board.viewport.y) / board.viewport.zoom };
  }
  function selectionObjects() { return board.objects.filter(item => selected.has(item.id)); }
  function selectObject(object, additive = false) {
    if (!additive) selected.clear();
    if (object.group) board.objects.filter(item => item.group === object.group).forEach(item => selected.add(item.id));
    else if (additive && selected.has(object.id)) selected.delete(object.id);
    else selected.add(object.id);
    render();
  }
  function objectElement(item) {
    const element = document.createElement("div");
    element.className = `board-object board-${item.type}${selected.has(item.id) ? " selected" : ""}${item.locked ? " locked" : ""}`;
    element.dataset.objectId = item.id;
    element.style.cssText = `left:${item.x}px;top:${item.y}px;width:${Math.max(8,item.w)}px;height:${Math.max(8,item.h)}px;z-index:${item.z || 0};transform:rotate(${item.rotation || 0}deg)`;
    if (item.type === "image") {
      const image = document.createElement("img"); image.src = item.src; image.draggable = false; image.alt = item.name || "Reference"; image.style.objectFit = item.fit || "contain"; element.append(image);
    } else if (item.type === "text") {
      const text = document.createElement("div"); text.className = "board-text-content"; text.textContent = item.text || "Text"; text.style.fontSize = `${item.fontSize || 20}px`; text.style.textAlign = item.textAlign || "left"; text.style.fontWeight = item.bold ? "700" : "400"; text.style.color = item.color || "var(--text,#f2f2f2)"; element.append(text);
    } else if (["pen","pencil","marker"].includes(item.type)) {
      const width = item.type === "marker" ? 12 : item.type === "pencil" ? 1.5 : 3, opacity = item.type === "marker" ? .38 : 1;
      const points = (item.points || []).map(point => `${point.x},${point.y}`).join(" ");
      element.innerHTML = `<svg viewBox="0 0 ${Math.max(1,item.w)} ${Math.max(1,item.h)}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" vector-effect="non-scaling-stroke"/></svg>`;
    } else if (["line", "arrow"].includes(item.type)) {
      element.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arrow-${item.id}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor"/></marker></defs><line x1="2" y1="98" x2="98" y2="2" marker-end="${item.type === "arrow" ? `url(#arrow-${item.id})` : ""}"/></svg>`;
    } else {
      const shape = document.createElement("div"); shape.className = "board-shape-content"; element.append(shape);
    }
    if (selected.has(item.id) && !item.locked) {
      const resize = document.createElement("i"); resize.className = "board-resize"; resize.dataset.handle = "resize"; element.append(resize);
      const rotate = document.createElement("i"); rotate.className = "board-rotate"; rotate.dataset.handle = "rotate"; element.append(rotate);
    }
    return element;
  }
  function render() {
    if (!board) return;
    canvas.style.backgroundColor = board.background;
    canvas.style.setProperty("--board-grid", `${board.grid || 0}px`);
    canvas.classList.toggle("no-grid", !board.grid);
    canvas.replaceChildren(...board.objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).map(objectElement));
    document.getElementById("board-background").value = board.background;
    document.getElementById("board-grid").value = String(board.grid);
    document.getElementById("board-snap").checked = board.snap;
    document.getElementById("board-selection-label").textContent = selected.size ? `${selected.size} selected` : `${board.objects.length} objects`;
    applyViewport();
  }
  function renderBoardSelect() {
    const select = document.getElementById("board-select");
    const current = board?.id;
    select.innerHTML = boards.map(item => `<option value="${item.id}"${item.id === current ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  }
  async function openBoard(id) {
    const loaded = await window.desktop.loadBoard(id);
    if (!loaded) return;
    board = loaded; board.viewport ||= { x: -3500, y: -2600, zoom: 1 }; board.objects ||= [];
    selected.clear(); history = []; historyIndex = -1; snapshot(); render(); renderBoardSelect();
  }
  async function initialize() {
    boards = await window.desktop.listBoards();
    if (!boards.length) {
      board = await window.desktop.saveBoard(blankBoard("Reference Board 1"));
      boards = [{ id: board.id, name: board.name, updatedAt: board.updatedAt }];
    }
    await openBoard(boards[0].id);
  }
  function addObject(item, record = true) {
    board.objects.push({ id: uid(), x: 4000, y: 3000, w: 240, h: 160, rotation: 0, z: highestZ() + 1, locked: false, ...item });
    selected = new Set([board.objects.at(-1).id]);
    if (record) snapshot(); render(); scheduleSave();
  }
  function addImage(dataUrl, name, position) {
    addObject({ type: "image", src: dataUrl, name, x: position?.x ?? 3900, y: position?.y ?? 2900, w: 320, h: 220, fit: "contain" });
  }
  async function readFiles(files, position) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      addImage(dataUrl, file.name, position);
      position = { x: position.x + 30, y: position.y + 30 };
    }
  }
  function setTool(next) {
    tool = next;
    document.querySelectorAll("[data-board-tool]").forEach(button => button.classList.toggle("active", button.dataset.boardTool === tool));
    viewport.dataset.tool = tool;
  }
  function commitChange() { snapshot(); render(); scheduleSave(); }
  function hideGuides() { document.getElementById("board-guide-x").hidden = true; document.getElementById("board-guide-y").hidden = true; }
  function alignMove(original, dx, dy) {
    let x = original.x + dx, y = original.y + dy, guideX = null, guideY = null;
    const movingCenterX = x + original.w / 2, movingCenterY = y + original.h / 2;
    for (const other of board.objects) {
      if (selected.has(other.id)) continue;
      const centerX = other.x + other.w / 2, centerY = other.y + other.h / 2;
      if (Math.abs(movingCenterX - centerX) < 6 / board.viewport.zoom) { x += centerX - movingCenterX; guideX = centerX; }
      if (Math.abs(movingCenterY - centerY) < 6 / board.viewport.zoom) { y += centerY - movingCenterY; guideY = centerY; }
    }
    const vertical = document.getElementById("board-guide-x"), horizontal = document.getElementById("board-guide-y");
    vertical.hidden = guideX === null; horizontal.hidden = guideY === null;
    if (guideX !== null) vertical.style.left = `${board.viewport.x + guideX * board.viewport.zoom}px`;
    if (guideY !== null) horizontal.style.top = `${board.viewport.y + guideY * board.viewport.zoom}px`;
    return { x: snap(x), y: snap(y) };
  }

  canvas.addEventListener("pointerdown", async event => {
    const target = event.target.closest(".board-object");
    const point = screenToWorld(event.clientX, event.clientY);
    if (target && tool === "select") {
      const item = board.objects.find(value => value.id === target.dataset.objectId);
      selectObject(item, event.shiftKey);
      if (item.locked) return;
      const handle = event.target.dataset.handle;
      const originals = selectionObjects().map(value => ({ id: value.id, x: value.x, y: value.y, w: value.w, h: value.h, rotation: value.rotation || 0 }));
      interaction = { type: handle || "move", start: point, originals, object: item };
      viewport.setPointerCapture(event.pointerId);
      event.stopPropagation();
      return;
    }
    if (tool === "text") {
      const text = await ask("Text", "Reference note"); if (text) addObject({ type: "text", text, x: snap(point.x), y: snap(point.y), w: 240, h: 80, fontSize:20, textAlign:"left", bold:false, color:getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f2f2f2" }); setTool("select"); return;
    }
    if (tool === "eraser") { if (target) { board.objects = board.objects.filter(item => item.id !== target.dataset.objectId || item.locked); commitChange(); } return; }
    if (["pen","pencil","marker"].includes(tool)) { interaction = { type:"draw", brush:tool, points:[point] }; viewport.setPointerCapture(event.pointerId); return; }
    if (["rect", "ellipse", "line", "arrow", "frame"].includes(tool)) {
      interaction = { type: "create", shape: tool, start: point, point };
      viewport.setPointerCapture(event.pointerId); return;
    }
    if (tool === "hand" || spaceDown || event.button === 1) {
      interaction = { type: "pan", clientX: event.clientX, clientY: event.clientY, x: board.viewport.x, y: board.viewport.y };
      viewport.setPointerCapture(event.pointerId); return;
    }
    selected.clear(); render();
  });
  canvas.addEventListener("dblclick", async event => {
    const target = event.target.closest(".board-text"); if (!target) return;
    const item = board.objects.find(value => value.id === target.dataset.objectId); if (!item || item.locked) return;
    const text = await ask("Edit text", item.text || ""); if (text === null) return; item.text = text; commitChange();
  });
  viewport.addEventListener("pointermove", event => {
    if (!interaction) return;
    const point = screenToWorld(event.clientX, event.clientY);
    if (interaction.type === "pan") {
      board.viewport.x = interaction.x + event.clientX - interaction.clientX; board.viewport.y = interaction.y + event.clientY - interaction.clientY; applyViewport(); return;
    }
    if (interaction.type === "move") {
      const dx = point.x - interaction.start.x, dy = point.y - interaction.start.y;
      const aligned = alignMove(interaction.originals[0], dx, dy), offsetX = aligned.x - interaction.originals[0].x, offsetY = aligned.y - interaction.originals[0].y;
      for (const original of interaction.originals) { const item = board.objects.find(value => value.id === original.id); item.x = original.x + offsetX; item.y = original.y + offsetY; }
      render(); return;
    }
    if (interaction.type === "resize") {
      const original = interaction.originals.find(value => value.id === interaction.object.id);
      interaction.object.w = Math.max(24, snap(original.w + point.x - interaction.start.x)); interaction.object.h = Math.max(24, snap(original.h + point.y - interaction.start.y)); render(); return;
    }
    if (interaction.type === "rotate") {
      const item = interaction.object, centerX = item.x + item.w / 2, centerY = item.y + item.h / 2;
      item.rotation = Math.round(Math.atan2(point.y - centerY, point.x - centerX) * 180 / Math.PI + 90); render(); return;
    }
    if (interaction.type === "create") interaction.point = point;
    if (interaction.type === "draw") interaction.points.push(point);
  });
  viewport.addEventListener("pointerup", event => {
    if (!interaction) return;
    if (interaction.type === "create") {
      const left = snap(Math.min(interaction.start.x, interaction.point.x)), top = snap(Math.min(interaction.start.y, interaction.point.y));
      const width = Math.max(40, snap(Math.abs(interaction.point.x - interaction.start.x))), height = Math.max(40, snap(Math.abs(interaction.point.y - interaction.start.y)));
      addObject({ type: interaction.shape, x: left, y: top, w: width, h: height }); setTool("select");
    } else if (interaction.type === "draw") {
      const minX=Math.min(...interaction.points.map(point=>point.x)), minY=Math.min(...interaction.points.map(point=>point.y)), maxX=Math.max(...interaction.points.map(point=>point.x)), maxY=Math.max(...interaction.points.map(point=>point.y));
      addObject({ type:interaction.brush, x:minX, y:minY, w:Math.max(2,maxX-minX), h:Math.max(2,maxY-minY), points:interaction.points.map(point=>({x:point.x-minX,y:point.y-minY})) });
    } else if (interaction.type !== "pan") commitChange();
    else scheduleSave();
    interaction = null;
    hideGuides();
    try { viewport.releasePointerCapture(event.pointerId); } catch {}
  });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    const next = Math.min(4, Math.max(.08, board.viewport.zoom * Math.exp(-event.deltaY * .0015)));
    const rect = viewport.getBoundingClientRect();
    board.viewport.zoom = next;
    board.viewport.x = event.clientX - rect.left - before.x * next; board.viewport.y = event.clientY - rect.top - before.y * next;
    applyViewport(); scheduleSave();
  }, { passive: false });
  function zoomAtCenter(multiplier) {
    const rect=viewport.getBoundingClientRect(),clientX=rect.left+rect.width/2,clientY=rect.top+rect.height/2,before=screenToWorld(clientX,clientY),next=Math.min(4,Math.max(.08,board.viewport.zoom*multiplier));
    board.viewport.zoom=next;board.viewport.x=clientX-rect.left-before.x*next;board.viewport.y=clientY-rect.top-before.y*next;applyViewport();scheduleSave();
  }
  function fitBoard() {
    if(!board.objects.length){board.viewport={x:-3500,y:-2600,zoom:1};applyViewport();scheduleSave();return;}
    const rect=viewport.getBoundingClientRect(),padding=90,minX=Math.min(...board.objects.map(item=>item.x)),minY=Math.min(...board.objects.map(item=>item.y)),maxX=Math.max(...board.objects.map(item=>item.x+item.w)),maxY=Math.max(...board.objects.map(item=>item.y+item.h));
    const zoom=Math.min(2,Math.max(.08,Math.min((rect.width-padding*2)/(maxX-minX),(rect.height-padding*2)/(maxY-minY))));board.viewport.zoom=zoom;board.viewport.x=(rect.width-(maxX-minX)*zoom)/2-minX*zoom;board.viewport.y=(rect.height-(maxY-minY)*zoom)/2-minY*zoom;applyViewport();scheduleSave();
  }
  document.getElementById("board-zoom-out").addEventListener("click",()=>zoomAtCenter(.8));document.getElementById("board-zoom-in").addEventListener("click",()=>zoomAtCenter(1.25));document.getElementById("board-zoom").addEventListener("click",()=>zoomAtCenter(1/board.viewport.zoom));document.getElementById("board-zoom-fit").addEventListener("click",fitBoard);
  viewport.addEventListener("dragover", event => { event.preventDefault(); viewport.classList.add("drop-target"); });
  viewport.addEventListener("dragleave", () => viewport.classList.remove("drop-target"));
  viewport.addEventListener("drop", async event => { event.preventDefault(); viewport.classList.remove("drop-target"); await readFiles([...event.dataTransfer.files], screenToWorld(event.clientX, event.clientY)); });
  document.addEventListener("paste", async event => {
    if (activeView !== "whiteboard") return;
    const images = [...event.clipboardData.files].filter(file => file.type.startsWith("image/"));
    if (images.length) { const rect = viewport.getBoundingClientRect(); return readFiles(images, screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)); }
    const text = event.clipboardData.getData("text/plain").trim();
    if (/^https:\/\//i.test(text)) try { const image = await window.desktop.importBoardUrl(text); addImage(image.dataUrl, image.name); } catch (error) { showMessage(error.message); }
  });

  document.querySelectorAll("[data-board-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.boardTool)));
  document.getElementById("board-add-image").addEventListener("click", async () => { const images = await window.desktop.importBoardImages(); images.forEach((image, index) => addImage(image.dataUrl, image.name, { x: 3880 + index * 28, y: 2880 + index * 28 })); });
  document.getElementById("board-select").addEventListener("change", event => openBoard(event.target.value));
  document.getElementById("board-new").addEventListener("click", async () => { const name = await ask("Board name", `Reference Board ${boards.length + 1}`); if (!name) return; board = await window.desktop.saveBoard(blankBoard(name)); boards.unshift({ id: board.id, name: board.name, updatedAt: board.updatedAt }); await openBoard(board.id); });
  document.getElementById("board-rename").addEventListener("click", async () => { const name = await ask("Board name", board.name); if (!name) return; board.name = name; scheduleSave(); renderBoardSelect(); });
  document.getElementById("board-duplicate").addEventListener("click", async () => { let copy = clone(board); copy.id = uid(); copy.name = `${board.name} Copy`; copy = await window.desktop.saveBoard(copy); boards.unshift({ id: copy.id, name: copy.name, updatedAt: copy.updatedAt }); await openBoard(copy.id); });
  document.getElementById("board-delete").addEventListener("click", async () => { if (boards.length <= 1) return showMessage("Keep at least one board."); if (!confirm(`Delete board “${board.name}”?`)) return; boards = await window.desktop.deleteBoard(board.id); await openBoard(boards[0].id); });
  document.getElementById("board-undo").addEventListener("click", () => restoreHistory(historyIndex - 1));
  document.getElementById("board-redo").addEventListener("click", () => restoreHistory(historyIndex + 1));
  document.getElementById("board-forward").addEventListener("click", () => { selectionObjects().forEach(item => item.z = highestZ() + 1); commitChange(); });
  document.getElementById("board-backward").addEventListener("click", () => { selectionObjects().forEach(item => item.z = lowestZ() - 1); commitChange(); });
  document.getElementById("board-lock").addEventListener("click", () => { selectionObjects().forEach(item => item.locked = !item.locked); commitChange(); });
  document.getElementById("board-duplicate-object").addEventListener("click", () => { const copies = selectionObjects().map(item => ({ ...clone(item), id: uid(), x: item.x + 24, y: item.y + 24, z: highestZ() + 1 })); board.objects.push(...copies); selected = new Set(copies.map(item => item.id)); commitChange(); });
  document.getElementById("board-group").addEventListener("click", () => { if (selected.size < 2) return; const group = uid(); selectionObjects().forEach(item => item.group = group); commitChange(); });
  document.getElementById("board-ungroup").addEventListener("click", () => { selectionObjects().forEach(item => item.group = ""); commitChange(); });
  document.getElementById("board-crop").addEventListener("click", () => { selectionObjects().filter(item => item.type === "image").forEach(item => item.fit = item.fit === "cover" ? "contain" : "cover"); commitChange(); });
  document.getElementById("board-remove").addEventListener("click", () => { board.objects = board.objects.filter(item => !selected.has(item.id) || item.locked); selected.clear(); commitChange(); });
  document.getElementById("board-background").addEventListener("input", event => { board.background = event.target.value; render(); scheduleSave(); });
  document.getElementById("board-grid").addEventListener("change", event => { board.grid = Number(event.target.value); commitChange(); });
  document.getElementById("board-snap").addEventListener("change", event => { board.snap = event.target.checked; commitChange(); });
  const updateSelectedText = changes => { selectionObjects().filter(item => item.type === "text").forEach(item => Object.assign(item, changes)); commitChange(); };
  document.getElementById("board-font-size").addEventListener("change", event => updateSelectedText({ fontSize:Math.max(8,Math.min(144,Number(event.target.value)||20)) }));
  document.getElementById("board-text-align").addEventListener("change", event => updateSelectedText({ textAlign:event.target.value }));
  document.getElementById("board-text-color").addEventListener("input", event => updateSelectedText({ color:event.target.value }));
  document.getElementById("board-text-bold").addEventListener("click", () => { const text=selectionObjects().find(item=>item.type==="text"); updateSelectedText({ bold:!text?.bold }); });
  document.getElementById("board-paste-url").addEventListener("click", async () => { const url = await ask("Direct HTTPS image URL"); if (!url) return; try { const image = await window.desktop.importBoardUrl(url); addImage(image.dataUrl, image.name); } catch (error) { showMessage(error.message); } });
  document.getElementById("board-fullscreen").addEventListener("click", () => window.desktop.toggleFullscreen());
  document.getElementById("board-always-top").addEventListener("change", event => window.desktop.setAlwaysOnTop(event.target.checked));
  document.getElementById("board-panel-toggle").addEventListener("click", () => { document.getElementById("whiteboard-section").classList.toggle("properties-hidden"); localStorage.setItem("media-gecko-board-properties", String(document.getElementById("whiteboard-section").classList.contains("properties-hidden"))); });
  document.getElementById("whiteboard-section").classList.toggle("properties-hidden", localStorage.getItem("media-gecko-board-properties") === "true");

  async function exportBoard(format) {
    const objects = board.objects.slice();
    if (!objects.length) return showMessage("Board is empty.");
    const padding = 50, minX = Math.min(...objects.map(item => item.x)) - padding, minY = Math.min(...objects.map(item => item.y)) - padding;
    const maxX = Math.max(...objects.map(item => item.x + item.w)) + padding, maxY = Math.max(...objects.map(item => item.y + item.h)) + padding;
    const scale = Math.min(2, 8000 / Math.max(maxX - minX, maxY - minY));
    const output = document.createElement("canvas"); output.width = Math.ceil((maxX - minX) * scale); output.height = Math.ceil((maxY - minY) * scale);
    const context = output.getContext("2d"); context.scale(scale, scale); context.fillStyle = board.background; context.fillRect(0, 0, output.width / scale, output.height / scale);
    for (const item of objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0))) {
      context.save(); context.translate(item.x - minX + item.w / 2, item.y - minY + item.h / 2); context.rotate((item.rotation || 0) * Math.PI / 180); context.translate(-item.w / 2, -item.h / 2);
      context.strokeStyle = "#d0d0d0"; context.lineWidth = 2;
      if (item.type === "image") { const image = new Image(); image.src = item.src; await image.decode().catch(() => {}); context.drawImage(image, 0, 0, item.w, item.h); }
      else if (item.type === "text") { context.fillStyle = item.color || "#f2f2f2"; context.font = `${item.bold ? "700 " : ""}${item.fontSize || 20}px Segoe UI`; context.textAlign = item.textAlign || "left"; context.fillText(item.text || "Text", item.textAlign === "center" ? item.w/2 : item.textAlign === "right" ? item.w-8 : 8, (item.fontSize || 20)+8, item.w - 16); }
      else if (["pen","pencil","marker"].includes(item.type)) { const points=item.points||[]; if(points.length){context.globalAlpha=item.type==="marker"?.38:1;context.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--icon-accent").trim()||"#ddd";context.lineWidth=item.type==="marker"?12:item.type==="pencil"?1.5:3;context.lineCap="round";context.lineJoin="round";context.beginPath();context.moveTo(points[0].x,points[0].y);points.slice(1).forEach(point=>context.lineTo(point.x,point.y));context.stroke();} }
      else if (item.type === "ellipse") { context.beginPath(); context.ellipse(item.w / 2, item.h / 2, item.w / 2, item.h / 2, 0, 0, Math.PI * 2); context.stroke(); }
      else if (["line", "arrow"].includes(item.type)) { context.beginPath(); context.moveTo(0, item.h); context.lineTo(item.w, 0); context.stroke(); }
      else context.strokeRect(0, 0, item.w, item.h);
      context.restore();
    }
    const dataUrl = output.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", .94);
    const file = await window.desktop.exportBoard(dataUrl, board.name, format); if (file) showMessage("Board exported.");
  }
  document.getElementById("board-export").addEventListener("click", () => exportBoard(document.getElementById("board-export-format").value));
  document.addEventListener("keydown", event => {
    if (activeView !== "whiteboard" || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    spaceDown = event.code === "Space" || spaceDown;
    if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); }
    else if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); }
    else if (event.ctrlKey && event.key.toLowerCase() === "a") { event.preventDefault(); selected = new Set(board.objects.map(item => item.id)); render(); }
    else if (event.ctrlKey && event.key.toLowerCase() === "c") { event.preventDefault(); boardClipboard = selectionObjects().map(clone); }
    else if (event.ctrlKey && event.key.toLowerCase() === "v" && boardClipboard.length) { event.preventDefault(); const copies=boardClipboard.map(item=>({...clone(item),id:uid(),x:item.x+28,y:item.y+28,z:highestZ()+1}));board.objects.push(...copies);selected=new Set(copies.map(item=>item.id));commitChange(); }
    else if (event.ctrlKey && event.key.toLowerCase() === "d") { event.preventDefault(); document.getElementById("board-duplicate-object").click(); }
    else if (event.ctrlKey && event.key.toLowerCase() === "g") { event.preventDefault(); document.getElementById(event.shiftKey ? "board-ungroup" : "board-group").click(); }
    else if (["Delete", "Backspace"].includes(event.key)) document.getElementById("board-remove").click();
    else if ({ v:"select", h:"hand", p:"pen", n:"pencil", m:"marker", e:"eraser", t:"text", r:"rect", o:"ellipse", l:"line", a:"arrow", f:"frame" }[event.key.toLowerCase()]) setTool({ v:"select", h:"hand", p:"pen", n:"pencil", m:"marker", e:"eraser", t:"text", r:"rect", o:"ellipse", l:"line", a:"arrow", f:"frame" }[event.key.toLowerCase()]);
  });
  document.addEventListener("keyup", event => { if (event.code === "Space") spaceDown = false; });

  initialize().catch(error => showMessage(`Board error: ${error.message}`));
  window.mediaGeckoWhiteboard = { activate() { viewport.focus(); render(); }, benchmark(count = 300) { const previous = board.objects; const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="; board.objects = Array.from({ length: count }, (_, index) => ({ id: uid(), type: "image", src: pixel, x: 3500 + index % 25 * 42, y: 2500 + Math.floor(index / 25) * 42, w: 36, h: 36, z: index })); const started = performance.now(); render(); const milliseconds = Math.round(performance.now() - started); board.objects = previous; render(); return milliseconds; } };
})();
