import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5210/';
const PORT = '9355';
const profile = path.resolve(`node_modules/.mafias-scroll/profile-${Date.now()}`);
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

const snap = () => ev(`JSON.stringify({
  y: Math.round(window.scrollY),
  pin: Math.round(window.innerHeight*0.1),
  max: Math.max(1, document.documentElement.scrollHeight-window.innerHeight),
  bar: getComputedStyle(document.querySelector('.scroll-progress')).transform,
  camZ: +window.__MAFIAS__.camera.position.z.toFixed(2)
})`);

const beforeStr = await snap();
log('BEFORE ' + beforeStr);
const before = JSON.parse(beforeStr);

// real user wheel input, not a scripted scrollTo
for (let i = 0; i < 6; i++) {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 420, pointerType: 'mouse' });
  await sleep(180);
}
await sleep(1500);
const after = JSON.parse(await snap());
log('AFTER_WHEEL ' + JSON.stringify(after));
await sleep(2000);
const settled = JSON.parse(await snap());
log('SETTLED ' + JSON.stringify(settled));

// scroll back to the top, make sure it stays there too
await ev(`window.scrollTo(0,0)`);
await sleep(2500);
const top = JSON.parse(await snap());
log('BACK_TO_TOP ' + JSON.stringify(top));

const scrollStayed = settled.y > 400;
const noSnapToPin = Math.abs(settled.y - settled.pin) > 40;
const barMoved = settled.bar !== before.bar && settled.bar !== 'none';
const cameraMoved = typeof settled.camZ === 'number' && Math.abs(settled.camZ - (before.camZ ?? settled.camZ)) > 1;
const stayedAtTop = top.y < 40;

log('CHECK wheel_scroll_persisted=' + scrollStayed + ' not_pinned_to_' + settled.pin + 'px=' + noSnapToPin + ' progress_bar_moved=' + barMoved + ' camera_moved=' + cameraMoved + ' top_stays_top=' + stayedAtTop);
log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5)));
const pass = scrollStayed && noSnapToPin && barMoved && cameraMoved && stayedAtTop;
log(pass ? 'RESULT PASS' : 'RESULT FAIL');
ws.close(); chrome.kill(); process.exit(pass ? 0 : 1);
