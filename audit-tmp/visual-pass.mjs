import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5176/';
const OUT = path.resolve('audit-tmp');

// bump from 9333 so the stale DevTools profile on 9333 never collides
const PORT = process.env.PORT || '9360';
const profile = path.resolve(`node_modules/.mafias-visual/profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 18), ...a);

const flags = [
  '--headless=new', '--no-sandbox',
  ...(process.env.NO_SWIFT ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']),
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,800', 'about:blank',
];
log('chrome flags:', flags.join(' '));
const profileDir = profile;
let chrome;
try { chrome = spawn(CHROME, flags, { stdio: 'ignore', timeout: 60000 }); }
catch (e) {
  log('CHROME SPAWN FAILED', e?.message || e);
  try { execSync('powershell -NoProfile -File /tmp/killchromes.ps1', { timeout: 15000 }); } catch {}
  process.exit(2);
}
log('chrome pid', chrome?.pid);
process.on('exit', () => { try { if (chrome?.pid) chrome.kill(); } catch {} });

async function tries(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('DevTools endpoint not reachable: ' + url);
}

await tries(`http://127.0.0.1:${PORT}/json/version`);
log('devtools up');
const put = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
const target = await put.json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0; const pending = new Map();
const consoleErrors = []; const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); log('shot ' + name); };

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');// boot: require both a canvas and two React roots so the scene is actually mounted.
let booted = false;
for (let i = 0; i < 240; i++) {
  try {
    const ok = await ev(`!!document.querySelector('canvas') && !!document.querySelector('[data-reactroot]') && !!document.querySelector('canvas').getContext('webgl')`);
    if (ok) { booted = true; break; }
  } catch {}
  if (i % 10 === 9) log('waiting for boot...', i);
  await sleep(500);
}
log(booted ? 'BOOT OK' : 'BOOT FAILED');
if (!booted) {
  log('CONSOLE_ERRORS ' + JSON.stringify(consoleErrors.slice(0, 10)));
  log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 10)));
  try { const diag = await ev(`JSON.stringify({href:location.href,ready:document.readyState,crash:!!document.querySelector('.crash'),fallback:!!document.querySelector('.fallback'),canvas:!!document.querySelector('canvas'),loading:!!document.querySelector('.loading'),body:document.body.innerText.slice(0,220)})`); log('DIAG ' + diag); } catch (e) { log('DIAG FAILED ' + e.message); }
  ws.close(); chrome.kill(); process.exit(1);
}
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(3000);

try {
  const sceneInfo = await ev(`(()=>{const M=window.__MAFIAS__;if(!M)return null;const lights=[];M.scene.traverse(o=>{if(o.isLight)lights.push(o.type+(o.castShadow?' +shadow':''));});return JSON.stringify({fog:M.scene.fog?{color:'#'+M.scene.fog.color.getHexString(),density:M.scene.fog.density}:null,shadowsEnabled:M.renderer?.shadowMap?.enabled ?? null, shadowType:M.renderer?.shadowMap?.type ?? null,toneMapping:M.renderer?.toneMapping ?? null,exposure:M.renderer?.toneMappingExposure ?? null,lights,camera:M.camera?{x:+M.camera.position.x.toFixed(2),y:+M.camera.position.y.toFixed(2),z:+M.camera.position.z.toFixed(2)}:null});})()`);
  log('SCENE ' + sceneInfo);
} catch (e) { log('SCENE FAILED ' + (e?.message || e)); }

// shadow isolation: mute every non-shadow-casting light, shoot, restore
try {
  await ev(`(()=>{const M=window.__MAFIAS__;M.__saved=[];M.scene.traverse(o=>{if(o.isLight){M.__saved.push([o,o.intensity]);if(!o.castShadow)o.intensity=0;}});return 'muted';})()`);
  await sleep(3000);
  await shot('s1-keyonly.jpg');
  log('SHADOWS ' + JSON.stringify((await ev(`(()=>{const M=window.__MAFIAS__;const out=[];M.scene.traverse(o=>{if(o.isLight&&o.castShadow)out.push({t:o.type,map:o.shadow&&o.shadow.map?o.shadow.map.width+'x'+o.shadow.map.height:'none'});});return out;})()`))));
  // decisive A/B: kill shadow mapping entirely, shoot the same view, restore
  await ev(`(()=>{const M=window.__MAFIAS__;if(M.renderer)M.renderer.shadowMap.enabled=false;M.scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});return 'shadows off';})()`);
  await sleep(4000);
  await shot('s2-noshadow.jpg');
  await ev(`(()=>{const M=window.__MAFIAS__;if(M.renderer)M.renderer.shadowMap.enabled=true;(M.__saved||[]).forEach(([o,v])=>o.intensity=v);M.scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});return 'restored';})()`);
  await sleep(2500);
} catch (e) { log('SHADOW_PASS FAILED ' + (e?.message || e)); }

// bounded frame-time + draw-call sample (quiet proxy: value is logged, never alerted)
try {
  const perf = await Promise.race([
    ev(`new Promise(res=>{const d=[];let last=performance.now(),n=0;function f(){const now=performance.now();d.push(now-last);last=now;if(++n<12)requestAnimationFrame(f);else{const s=d.slice(3).reduce((a,b)=>a+b,0)/(d.length-3);res(JSON.stringify({avgFrameMs:+s.toFixed(1),frames:d.map(x=>+x.toFixed(0)),info:window.__MAFIAS__?.renderer?.info?.render ?? null});}}requestAnimationFrame(f);})`),
    sleep(90000).then(() => 'timeout')
  ]);
  log('PERF ' + perf);
} catch (e) { log('PERF FAILED ' + (e?.message || e)); }

await shot('v1-open.jpg');
for (const [p, name] of [[0.35,'v2-scroll35.jpg'],[0.7,'v3-scroll70.jpg'],[1.0,'v4-scroll100.jpg']]) {
  await ev(`window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*${p})`);
  await sleep(3000);
  await shot(name);
}
// enter flow still works (cross-over dive through the portal)
await ev(`window.scrollTo(0,0)`);
await sleep(2500);
await ev(`document.querySelector('.enter') && document.querySelector('.enter').click()`);
await sleep(4500);
const entered = await ev(`JSON.stringify({arrival:!!document.querySelector('.arrival'),entering:document.body.classList.contains('mafias-entering')})`);
log('ENTER ' + entered);
await shot('v5-arrival.jpg');

// mobile preset requires a reload (quality is picked at module load)
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Page.reload', { ignoreCache: true });
await sleep(1200);
let mboot = false;
for (let i = 0; i < 120; i++) {
  if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__)`)) { mboot = true; break; }
  await sleep(500);
}
log('MOBILE_BOOT ' + mboot);
if (mboot) {
  await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
  await sleep(3500);
  const mobileInfo = await ev(`(()=>{const M=window.__MAFIAS__;if(!M)return null;const lights=[];M.scene.traverse(o=>{if(o.isLight)lights.push(o.type+(o.castShadow?' +shadow':''));});return JSON.stringify({lights,shadowMapTextures:M.renderer.info.memory.shadowMap});})()`);
  log('MOBILE ' + (mobileInfo || 'no scene'));
  await shot('v6-mobile-open.jpg');
  await ev(`window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*0.5)`);
  await sleep(3000);
  await shot('v7-mobile-mid.jpg');
}

log('CONSOLE_ERRORS ' + JSON.stringify(consoleErrors.slice(0, 8)));
log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 8)));
log('DONE');
ws.close();
chrome.kill();
process.exit(0);
