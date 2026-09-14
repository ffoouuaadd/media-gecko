const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 9666);
const root = path.resolve(process.argv[3] || path.join(__dirname, "..", ".test-gif-frames"));
const fps = 8;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findTarget() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      const target = targets.find(item => item.type === "page" && /127\.0\.0\.1/.test(item.url) && !/mini(-preview)?\.html/.test(item.url));
      if (target) return target;
    } catch {}
    await wait(250);
  }
  throw new Error("Media Gecko renderer debug target not found.");
}

async function main() {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const target = await findTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });
  await evaluate(`
    await new Promise(resolve=>setTimeout(resolve,1200));
    document.getElementById('onboarding')?.setAttribute('hidden','');
    const style=document.createElement('style');
    style.textContent='.github-demo-caption{position:fixed;z-index:99999;right:18px;bottom:60px;max-width:440px;padding:10px 14px;border:1px solid var(--primary,#ff4e18);border-radius:5px;background:#151515ed;color:#fff;box-shadow:0 12px 35px #000a;font:600 15px Segoe UI,sans-serif;letter-spacing:.01em;transition:opacity .15s,transform .15s}.github-demo-caption small{display:block;margin-top:3px;color:#aaa;font:11px Consolas,monospace}.github-demo-pointer{position:fixed;z-index:99998;width:18px;height:18px;border:2px solid #fff;border-radius:50%;background:var(--primary,#ff4e18);box-shadow:0 0 0 5px #0007;pointer-events:none;transition:left .25s ease,top .25s ease}';
    document.head.appendChild(style);
    const caption=document.createElement('div');caption.className='github-demo-caption';caption.hidden=true;document.body.appendChild(caption);
    const pointer=document.createElement('div');pointer.className='github-demo-pointer';pointer.hidden=true;document.body.appendChild(pointer);
    window.__demo={
      caption:(title,detail='')=>{caption.hidden=false;caption.innerHTML='<b>'+title+'</b>'+(detail?'<small>'+detail+'</small>':'');},
      pointer:(x,y)=>{pointer.hidden=false;pointer.style.left=x+'px';pointer.style.top=y+'px';},
      hidePointer:()=>pointer.hidden=true
    };
  `);

  async function shot(folder, index) {
    const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(folder, `${String(index).padStart(4, "0")}.png`), Buffer.from(result.data, "base64"));
  }
  async function captureSequence(name, scenes) {
    const folder = path.join(root, name);
    fs.mkdirSync(folder, { recursive: true });
    let frame = 0;
    for (const scene of scenes) {
      await evaluate(scene.action);
      const frames = Math.max(1, Math.round((scene.seconds || 1.2) * fps));
      for (let index = 0; index < frames; index++) {
        await wait(1000 / fps);
        await shot(folder, frame++);
      }
    }
    console.log(`${name}: ${frame} frames`);
  }

  await captureSequence("overview", [
    { seconds: 1.4, action: `selectView('search');window.__demo.caption('Search everything','Local assets, projects, SFX and online sources');window.__demo.hidePointer();` },
    { seconds: 1.8, action: `mediaGeckoHub.openSearch('cinematic impact');window.__demo.caption('One universal search','Type once and jump straight to the asset');window.__demo.pointer(510,250);` },
    { seconds: 1.8, action: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));selectView('native');await new Promise(r=>setTimeout(r,180));window.__demo.caption('Native SFX','136 offline sounds plus live MyInstants search');window.__demo.pointer(420,270);` },
    { seconds: 1.6, action: `selectView('pngsources');window.__demo.caption('Google Images workspace','Search references, photos and transparent PNGs in-app');window.__demo.pointer(720,110);` },
    { seconds: 1.6, action: `selectView('browser');window.__demo.caption('Built-in browser','Browse asset sites and send downloads to your library');window.__demo.pointer(500,112);` },
    { seconds: 1.8, action: `document.getElementById('assistant-panel').hidden=true;document.getElementById('assistant-toggle').click();window.__demo.caption('Gecko Assistant','Discuss your edit and launch asset searches');window.__demo.pointer(1005,590);` },
  ]);

  await captureSequence("sfx-workflow", [
    { seconds: 1.1, action: `document.getElementById('assistant-panel').hidden=true;selectView('native');await new Promise(r=>setTimeout(r,180));document.getElementById('native-search').value='';document.getElementById('native-search').dispatchEvent(new Event('input',{bubbles:true}));window.__demo.caption('Search → Preview → Drag','Fast sound effects without leaving your editor');window.__demo.pointer(450,107);` },
    ...['i','im','imp','impa','impact'].map(value => ({ seconds: .28, action: `document.getElementById('native-search').value='${value}';document.getElementById('native-search').dispatchEvent(new Event('input',{bubbles:true}));window.__demo.pointer(${430 + value.length * 8},107);` })),
    { seconds: 1.4, action: `const card=document.querySelector('.native-sfx-card');const box=card?.getBoundingClientRect();if(box)window.__demo.pointer(box.left+45,box.top+48);window.__demo.caption('Instant in-app preview','Only one sound plays at a time');card?.querySelector('.native-main')?.click();` },
    { seconds: 1.5, action: `const card=document.querySelector('.native-sfx-card');card?.classList.add('drag-ready','draggable');document.body.classList.add('dragging-file');document.getElementById('drag-feedback').hidden=false;const box=card?.getBoundingClientRect();if(box)window.__demo.pointer(box.left+150,box.top+55);window.__demo.caption('Drag like a normal Windows file','Drop directly into Premiere, After Effects or a folder');` },
    { seconds: .8, action: `document.body.classList.remove('dragging-file');document.getElementById('drag-feedback').hidden=true;window.__demo.hidePointer();` },
  ]);

  await captureSequence("themes-layout", [
    { seconds: 1.2, action: `selectView('settings');document.querySelectorAll('#settings-section details').forEach((d,i)=>d.open=i<2);document.querySelector('#settings-section')?.scrollTo(0,0);window.__demo.caption('Make it yours','Theme, density, preview and layout controls');window.__demo.pointer(570,315);` },
    { seconds: 1.2, action: `uiSettings.theme='cyber';uiSettings.colors={...themePresets.cyber.colors};uiSettings.appearance='dark';applyUiSettings();renderSettings();window.__demo.caption('Electric Blue','Theme changes apply live');` },
    { seconds: 1.2, action: `uiSettings.theme='purple';uiSettings.colors={...themePresets.purple.colors};uiSettings.appearance='dark';applyUiSettings();renderSettings();window.__demo.caption('Violet','Six polished presets included');` },
    { seconds: 1.2, action: `uiSettings.theme='daylight';uiSettings.colors={...themePresets.daylight.colors};uiSettings.appearance='light';applyUiSettings();renderSettings();window.__demo.caption('Warm Light','Complete light and dark appearances');` },
    { seconds: 1.2, action: `uiSettings.theme='devo';uiSettings.colors={...themePresets.devo.colors};uiSettings.appearance='dark';applyUiSettings();renderSettings();window.__demo.caption('Compact creative workspace','Designed to sit beside your editing software');document.getElementById('sidebar-toggle').click();window.__demo.pointer(19,17);` },
  ]);
  socket.close();
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
