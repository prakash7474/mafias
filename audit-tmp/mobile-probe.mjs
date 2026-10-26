import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5199/';
const OUT = path.resolve('audit-tmp');
const PORT = process.env.PORT || '9344';
const profile = path.resolve(`node_modules/.mafias-visual/profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=375,812', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

async function tries(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('no devtools: ' + url);
}
await tries(`http://127.0.0.1:${PORT}/json/version`);
const put = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
const target = await put.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

let booted = false;
for (let i = 0; i < 90; i++) { if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__)`)) { booted = true; break; } await sleep(500); }
log('boot=' + booted, 'innerWidth=' + await ev(`window.innerWidth`), 'dpr=' + await ev(`window.devicePixelRatio`));
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(4000);

const inv = await ev(`(()=>{
  const M=window.__MAFIAS__; if(!M) return 'no hook';
  const lights=[]; const seenScene=[];
  M.scene.traverse(o=>{ if(o.isLight) lights.push({t:o.type,i:o.intensity,cs:!!o.castShadow,par:o.parent?o.parent.type:'none',uuid:o.uuid.slice(0,8)}); });
  let canvases=0; document.querySelectorAll('canvas').forEach(()=>canvases++);
  return JSON.stringify({
    canvases,
    sceneChildren: M.scene.children.length,
    lightCount: lights.length,
    lights,
    hookSceneId: M.scene.uuid.slice(0,8),
    hookRender: !!M.renderer,
    frames: M.renderer.info.render.frame
  });})()`);
log('INVENTORY ' + inv);
log('ERRORS so far: ' + errors.length);
if (errors.length) log('FIRST ERROR: ' + errors[0].split('\n').slice(0, 4).join(' | '));
await sleep(3000);
log('ERRORS after 3s more: ' + errors.length);
const r2 = await ev(`JSON.stringify(window.__MAFIAS__.renderer.info.render)`);
log('RENDER ' + r2);

const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
fs.writeFileSync(path.join(OUT, 'mp1-mobile.jpg'), Buffer.from(shot.data, 'base64'));
log('shot mp1-mobile.jpg');
ws.close(); chrome.kill(); process.exit(0);
