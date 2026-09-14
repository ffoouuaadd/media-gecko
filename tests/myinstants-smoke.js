const port = Number(process.argv[2] || 9574);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let page;
  for (let attempt = 0; attempt < 40 && !page; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      page = targets.find(item => item.type === "page" && /127\.0\.0\.1/.test(item.url) && !/mini/.test(item.url));
    } catch {}
    if (!page) await wait(250);
  }
  if (!page) throw new Error("Renderer target not found.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable");
  const evaluated = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    const results=await desktop.searchMyInstants('vine boom');
    const first=results[0];
    const asset=first?await desktop.cacheMyInstant({url:first.url,title:first.title}):null;
    selectView('native');
    const input=document.getElementById('native-search'); input.value='vine boom'; input.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,2200));
    const puck=document.querySelector('.sfx-puck'); const style=puck?getComputedStyle(puck):null;
    return {count:results.length,first:first&&{title:first.title,url:first.url,pageUrl:first.pageUrl},cached:Boolean(asset?.id),cachedSource:asset?.source,remoteCards:document.querySelectorAll('.remote-native').length,pixelClip:style?.clipPath||'',pixelRendering:style?.imageRendering||'',version:(await desktop.getAppInfo()).version};
  })()` });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
  console.log(JSON.stringify(evaluated.result.value, null, 2));
  socket.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
