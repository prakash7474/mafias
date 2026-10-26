import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5173/';
const OUT = path.resolve('audit-tmp');
const PORT = '9343';
const profile = path.resolve(`node_modules/.mafias-copy/profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,800', 'about:blank'
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
let id = 0; const pending = new Map(); const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  log('shot ' + name);
};
await send('Page.enable'); await send('Runtime.enable');

let booted = false;
for (let i = 0; i < 120; i++) {
  if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__)`)) { booted = true; break; }
  await sleep(500);
}
log(booted ? 'BOOT OK' : 'BOOT FAILED');
if (!booted) { log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5))); ws.close(); chrome.kill(); process.exit(1); }
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(2500);
await shot('copy-hero.jpg');
for (const [p, name] of [[0.25, 'copy-panel2.jpg'], [0.6, 'copy-panel3.jpg']]) {
  await ev(`window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*${p})`);
  await sleep(2000);
  await shot(name);
}
// overflow + old-copy checks
const checks = await ev(`(()=>{
  const text=document.body.innerText;
  const old=['INNER CIRCLE','SHADOWS','UNKNOWN','KEEP MOVING','FOG HIDES','ENTERTAIN, CREATE, AND INSPIRE'].filter(s=>text.toUpperCase().includes(s.toUpperCase()));
  const vw=window.innerWidth, overflow=document.documentElement.scrollWidth-vw;
  return JSON.stringify({oldFound:old, overflow, vw});})()`);
log('CHECKS ' + checks);
await ev(`window.scrollTo(0,0)`);
await sleep(1500);
await ev(`document.querySelector('.enter').click()`);
await sleep(4200);
await shot('copy-arrival.jpg');
log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5)));
ws.close(); chrome.kill(); process.exit(0);
