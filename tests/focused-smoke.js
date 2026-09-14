const port = Number(process.argv[2] || 9550);
const fs = require("node:fs");
const path = require("node:path");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let page;
  for (let attempt = 0; attempt < 40 && !page; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      page = targets.find(item => item.type === "page" && /127\.0\.0\.1/.test(item.url) && !/mini\.html/.test(item.url));
    } catch {}
    if (!page) await wait(250);
  }
  if (!page) throw new Error("Renderer debug target not found.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable");
  const result = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    await new Promise(resolve=>setTimeout(resolve,700));
    const info=await desktop.getAppInfo();
    const assistant=await desktop.assistantStatus();
    document.getElementById('assistant-panel').hidden=true;
    document.getElementById('assistant-toggle').click();
    await new Promise(resolve=>setTimeout(resolve,30));
    const assistantVisible=!document.getElementById('assistant-panel').hidden;
    document.getElementById('assistant-close').click();
    selectView('browser');
    const browserVisible=!document.getElementById('browser-section').hidden&&Boolean(document.getElementById('browser-view'));
    selectView('pngsources'); query.value='cinematic desert landscape';
    await runSearch();
    await new Promise(resolve=>setTimeout(resolve,900));
    const imageSiteUrl=document.getElementById('image-site-view').getURL();
    const google=await desktop.searchGoogleImages('cinematic desert landscape','photo').catch(()=>[]);
    const native=await desktop.listNativeSfx();
    selectView('native'); await new Promise(resolve=>setTimeout(resolve,120)); document.querySelector('.native-main')?.click();
    const puck=document.querySelector('.sfx-puck');
    const puckSize=puck?{width:puck.offsetWidth,height:puck.offsetHeight}:null;
    const savedTheme=loadStoredSettings();
    uiSettings.colors={...themePresets.cyber.colors}; applyUiSettings(); const bluePuck=puck?getComputedStyle(puck).backgroundImage:'';
    uiSettings.colors={...themePresets.purple.colors}; applyUiSettings(); const violetPuck=puck?getComputedStyle(puck).backgroundImage:'';
    uiSettings=savedTheme; applyUiSettings();
    const searches=await desktop.universalSearch('desert images');
    return {
      version:info.version,
      assistantVisible,
      assistantConnected:assistant.connected,
      browserVisible,
      googleImageCount:google.length,
      imageSiteUrl,
      dedicatedGoogleImages:imageSiteUrl.includes('google.com/search')&&(imageSiteUrl.includes('tbm=isch')||imageSiteUrl.includes('udm=2')),
      imageCardUiRemoved:!document.getElementById('png-results')&&!document.querySelector('[data-image-mode]'),
      nativeSfx:native.length,
      sfxPucks:document.querySelectorAll('.sfx-puck').length,
      puckSize,
      puckFollowsTheme:Boolean(bluePuck&&violetPuck&&bluePuck!==violetPuck),
      themePresets:Object.keys(themePresets).length,
      themeNames:Object.values(themePresets).map(item=>item.name),
      accentControls:document.querySelectorAll('[data-theme-color]').length,
      gamesRemoved:!document.getElementById('game-dock')&&!document.querySelector('[data-view=games]'),
      whiteboardRemoved:!document.getElementById('whiteboard-section')&&!document.querySelector('[data-view=whiteboard]'),
      onboardingRemoved:!document.getElementById('onboarding'),
      universalImageAction:searches.some(item=>item.media==='image')
    };
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  console.log(JSON.stringify(result.result.value, null, 2));
  await send("Runtime.evaluate", { expression: "document.getElementById('assistant-toggle').click()" });
  await wait(100);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const output = path.join(__dirname, "focused-latest.png");
  fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
  console.log(`Screenshot: ${output}`);
  socket.close();
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
