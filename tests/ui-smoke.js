const port = Number(process.argv[2] || 9333);
const fs = require("node:fs");
const path = require("node:path");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function target() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      const page = targets.find(item => item.type === "page" && /127\.0\.0\.1/.test(item.url));
      if (page) return page;
    } catch {}
    await wait(250);
  }
  throw new Error("Renderer debug target not found.");
}

async function main() {
  const page = await target();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable");
  const expression = `(async () => {
    await new Promise(resolve => setTimeout(resolve, 900));
    const info = await desktop.getAppInfo();
    const native = await desktop.listNativeSfx();
    const firstFetchStarted = performance.now();
    const previewStatus = native[0] ? (await fetch(native[0].previewUrl)).status : 0;
    const previewMs = Math.round(performance.now() - firstFetchStarted);
    selectView('native');
    await new Promise(resolve => setTimeout(resolve, 100));
    document.querySelector('.native-main')?.click();
    const nativeCards = document.querySelectorAll('.native-sfx-card').length;
    const audioReady = Boolean(document.getElementById('audio').src);
    const libraryBefore = await desktop.listLibrary({ limit: 100 });
    const audioAsset = libraryBefore.find(asset => asset.kind === 'audio');
    const searchResults = await desktop.universalSearch('impact');
    const commandResults = await desktop.universalSearch('clear cache');
    mediaGeckoHub.openSearch('impact');
    await new Promise(resolve => setTimeout(resolve, 180));
    const commandVisible = !document.getElementById('command-palette').hidden;
    const commandRows = document.querySelectorAll('.command-result').length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    let trayRoundTrip = false;
    let projectRoundTrip = false;
    let processedReady = false;
    if (audioAsset) {
      await desktop.addTray(audioAsset.id); trayRoundTrip = (await desktop.listTray()).some(asset => asset.id === audioAsset.id); await desktop.removeTray(audioAsset.id);
      const project = await desktop.saveProject({ name:'Smoke Project' });
      const withAsset = await desktop.addProjectAsset(project.id, audioAsset.id);
      projectRoundTrip = withAsset.assets.some(asset => asset.id === audioAsset.id); await desktop.deleteProject(project.id);
      const processed = await desktop.renderSoundLab(audioAsset.id, { speed:1, pitch:1, normalize:false });
      processedReady = Boolean(processed?.id && (await fetch('/api/library/file?id=' + encodeURIComponent(processed.id))).status === 200);
    }
    mediaGeckoHub.openOrganizer();
    await new Promise(resolve => setTimeout(resolve, 100));
    const organizerVisible = !document.getElementById('organizer-panel').hidden;
    document.getElementById('organizer-close').click();
    const pngAsset = await desktop.cacheRemoteImage('https://upload.wikimedia.org/wikipedia/commons/4/46/Gekkoninae_Gekko_gecko.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original', 'Gecko transparent PNG');
    const pngReady = Boolean(pngAsset?.id && pngAsset.kind === 'image' && (await fetch('/api/library/file?id=' + encodeURIComponent(pngAsset.id))).status === 200);
    mediaGeckoOnboarding.open(); const onboardingVisible = !document.getElementById('onboarding').hidden; document.getElementById('onboarding-next').click(); const setupFeatureCount=document.querySelectorAll('#feature-options [data-feature]').length; document.getElementById('onboarding-skip').click();
    navLayout[0].hidden=true; saveLayouts(); applyNavLayout(); document.getElementById('restore-all-tabs').click(); const allTabsRestored=navLayout.every(item=>!item.hidden);
    document.getElementById('space-launcher').click(); const spaceReady=!document.getElementById('mini-games-panel').hidden && document.getElementById('mini-game-title').textContent.includes('SPACE'); document.getElementById('tower-launcher').click(); const towerReady=document.getElementById('mini-game-title').textContent.includes('TOWER'); const gamesReady=spaceReady&&towerReady&&!document.querySelector('[data-view=games]')&&Boolean(document.getElementById('mini-game-leaderboard'));
    selectView('whiteboard'); const drawingTools = document.querySelectorAll('[data-board-tool=pen],[data-board-tool=pencil],[data-board-tool=marker],[data-board-tool=eraser]').length;
    const imageModes = document.querySelectorAll('[data-image-mode]').length;
    const googleImages = await desktop.searchGoogleImages('gecko', 'transparent');
    const envato = await desktop.envatoStatus();
    selectView('whiteboard');
    await new Promise(resolve => setTimeout(resolve, 100));
    const boardRender300Ms = mediaGeckoWhiteboard.benchmark(300);
    const boardsBefore = await desktop.listBoards();
    const smoke = await desktop.saveBoard({ id: crypto.randomUUID(), name: 'Smoke Board', background: '#202020', grid: 20, snap: true, viewport: {x:0,y:0,zoom:1}, objects: [{id:crypto.randomUUID(),type:'rect',x:10,y:10,w:100,h:80,z:1}] });
    const loaded = await desktop.loadBoard(smoke.id);
    await desktop.deleteBoard(smoke.id);
    document.getElementById('board-panel-toggle').click();
    const panelCollapsed = document.getElementById('whiteboard-section').classList.contains('properties-hidden');
    document.getElementById('board-panel-toggle').click();
    const themes = {};
    let lightSurfaceCount=0; for (const [key, preset] of Object.entries(themePresets)) { uiSettings.colors = {...preset.colors}; uiSettings.appearance = preset.appearance || 'dark'; applyUiSettings(); await new Promise(resolve => setTimeout(resolve, 240)); themes[key] = { appearance: document.body.dataset.appearance, logo: getComputedStyle(document.querySelector('.theme-gecko')).backgroundColor }; if((preset.appearance||'dark')==='light'){const targets=['.titlebar','.workspace>aside','.content','.media-row','.settings-block','.board-topbar','.snake-panel'];lightSurfaceCount=Math.max(lightSurfaceCount,targets.map(selector=>document.querySelector(selector)).filter(Boolean).filter(element=>{const match=getComputedStyle(element).backgroundColor.match(/[0-9]+/g);return match&&Number(match[0])+Number(match[1])+Number(match[2])>450;}).length);} }
    uiSettings = loadStoredSettings(); applyUiSettings();
    document.getElementById('workspace-compact').click(); const compact = document.body.classList.contains('workspace-focus'); document.getElementById('workspace-compact').click();
    return { version: info.version, nativeCount: native.length, nativeCards, previewStatus, previewMs, audioReady, searchResults:searchResults.length, commandFound:commandResults.some(item=>item.command==='clear-cache'), commandVisible, commandRows, trayRoundTrip, projectRoundTrip, processedReady, organizerVisible, organizerSearch:Boolean(document.getElementById('organizer-search')), pngReady, onboardingVisible, setupFeatureCount, allTabsRestored, gamesReady, drawingTools, boardToolrail:Boolean(document.querySelector('.board-toolrail')), boardNavigation:Boolean(document.querySelector('.board-navigation')), imageModes, googleImageResults:googleImages.length, envatoConnected:envato.connected, boardRender300Ms, boardsBefore: boardsBefore.length, boardRoundTrip: loaded?.objects?.length === 1, panelCollapsed, themeCount: Object.keys(themes).length, lightThemes: Object.values(themes).filter(value => value.appearance === 'light').length, lightSurfaceCount, themedLogos: new Set(Object.values(themes).map(value => value.logo)).size, themeSamples: Object.entries(themes).slice(0, 3), compact, navWhiteboard: Boolean(document.querySelector('[data-view=whiteboard]')), navNative: Boolean(document.querySelector('[data-view=native]')) };
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  console.log(JSON.stringify(result.result.value, null, 2));
  await send("Runtime.evaluate", { expression: "selectView('search'); mediaGeckoHub.openSearch('impact');" });
  await wait(250);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const output = path.join(__dirname, "ui-latest.png");
  fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
  console.log(`Screenshot: ${output}`);
  socket.close();
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
