const port = Number(process.argv[2] || 9777);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function target() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      const page = pages.find(item => item.type === "page" && /127\.0\.0\.1/.test(item.url) && !/mini/.test(item.url));
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
  await send("Runtime.enable");
  const result = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    await new Promise(resolve=>setTimeout(resolve,900));
    document.getElementById('onboarding')?.setAttribute('hidden','');
    selectView('settings');
    const picker=document.querySelector('[data-theme-color="primary"]');
    picker.value='#00c878';
    picker.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,80));
    const root=getComputedStyle(document.documentElement);
    const palette=['--primary','--orange2','--icon-accent','--selection','--glow','--button-accent','--progress','--waveform'].map(key=>root.getPropertyValue(key).trim());
    const cacheIcon=document.querySelector('.cache-row .ui-icon');
    const cacheIconColor=cacheIcon?getComputedStyle(cacheIcon).color:'';
    const iconColor=root.getPropertyValue('--icon-accent').trim();
    const lightOverlay=await desktop.setThemeAccent('#00c878','light');
    const support=document.querySelector('.support-link');
    const expanded={display:getComputedStyle(support).display,label:getComputedStyle(support.querySelector('span')).display};
    setSidebarMode('icons');
    const compact={display:getComputedStyle(support).display,label:getComputedStyle(support.querySelector('span')).display};
    return {
      custom:uiSettings.theme==='custom',
      primary:palette[0],
      palette,
      uniquePalette:new Set(palette).size,
      oldOrangeRemaining:palette.some(value=>/255, 78, 24|#ff4e18/i.test(value)),
      cacheIconColor,
      iconColor,
      lightOverlay,
      supportHref:support.href,
      supportTarget:support.target,
      expanded,
      compact
    };
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  console.log(JSON.stringify(result.result.value, null, 2));
  socket.close();
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
