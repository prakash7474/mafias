import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5179/';
const OUT = path.resolve('audit-tmp');
const PORT = '9345';
const profile = path.resolve(`node_modules/.mafias-mob/profile-${Date.now()}`);
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
  throw new Error('DevTools endpoint not reachable: ' + url);
}
await tries(`http://127.0.0.1:${PORT}/json/version`);
const put = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
const target = await put.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let id = 0; const pending = new Map(); const consoleErrors = []; const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); log('shot ' + name); };
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

let booted = false;
for (let i = 0; i < 120; i++) {
  if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__)`)) { booted = true; break; }
  await sleep(500);
}
log(booted ? 'BOOT OK' : 'BOOT FAILED');
if (!booted) { log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5))); ws.close(); chrome.kill(); process.exit(1); }
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(3000);
const mob = await ev(`(()=>{
  const M=window.__MAFIAS__;let ghosts=0;
  M.scene.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.type==='LatheGeometry')ghosts++;});
  const overflow=document.documentElement.scrollWidth-window.innerWidth;
  // frame-time sample
  return new Promise(res=>{const d=[];let last=performance.now(),n=0;
    function f(){const now=performance.now();d.push(now-last);last=now;if(++n<15)requestAnimationFrame(f);
      else{const s=d.slice(5).reduce((a,b)=>a+b,0)/(d.length-5);
        res(JSON.stringify({ghosts,overflow,avgFrameMs:+s.toFixed(1),info:window.__MAFIAS__.renderer.info.render}));}}
    requestAnimationFrame(f);});
})()`);
log('MOBILE ' + mob);
await shot('wind-mobile.jpg');
const noise = consoleErrors.filter(e => !/audio|drone|whoosh|404|resource/i.test(e));
log('CONSOLE_ERRORS ' + JSON.stringify(noise.slice(0, 5)));
log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5)));
ws.close(); chrome.kill(); process.exit(0);
