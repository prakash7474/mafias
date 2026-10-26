import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const OUT = path.resolve('node_modules/.mafias-audit');
fs.mkdirSync(OUT, { recursive: true });
// keep the browser profile out of the project tree so Vite's file watcher never watches it
const profile = path.resolve('node_modules/.mafias-audit/profile');
fs.mkdirSync(profile, { recursive: true });

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--user-data-dir=${profile}`, '--remote-debugging-port=9222', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

async function tries(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('DevTools endpoint not reachable: ' + url);
}

const ver = await tries('http://127.0.0.1:9222/json/version');
const put = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
const target = await put.json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

let id = 0; const pending = new Map(); const consoleErrors = []; const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(OUT, name.replace(/\.png$/, '.jpg')), Buffer.from(r.data, 'base64')); };

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

// 1. app boots and the graveyard scene mounts
let booted = false;
for (let i = 0; i < 60; i++) { if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__)`)) { booted = true; break; } await sleep(500); }
record('app boots, R3F canvas + scene mounted', booted, booted ? 'canvas and scene hook present' : 'canvas/scene never appeared');
await sleep(2500);
await shot('01-desktop-top.png');

// 2. scroll drives the camera forward
const z0 = await ev(`window.__MAFIAS__ ? window.__MAFIAS__.camera.position.z : null`);
await ev(`window.scrollTo(0, (document.documentElement.scrollHeight-window.innerHeight)*0.5)`);
await sleep(2500);
const zMid = await ev(`window.__MAFIAS__ ? window.__MAFIAS__.camera.position.z : null`);
const progressMid = await ev(`getComputedStyle(document.querySelector('.scroll-progress')).transform`);
await shot('02-desktop-midscroll.png');
record('scroll advances camera', typeof z0 === 'number' && typeof zMid === 'number' && zMid < z0 - 3, `z ${z0 && z0.toFixed(2)} -> ${zMid && zMid.toFixed(2)} (progress bar ${progressMid})`);

await ev(`window.scrollTo(0, 0)`);
await sleep(2500);
const zBack = await ev(`window.__MAFIAS__.camera.position.z`);
record('scrolling back reverses camera', typeof zBack === 'number' && Math.abs(zBack - z0) < 1.2, `z back to ${zBack && zBack.toFixed(2)} (started ${z0 && z0.toFixed(2)})`);

// 3. sound control
await ev(`document.querySelector('.sound').click()`);
const soundPressed = await ev(`document.querySelector('.sound').getAttribute('aria-pressed')`);
await ev(`document.querySelector('.sound').click()`);
const soundPressed2 = await ev(`document.querySelector('.sound').getAttribute('aria-pressed')`);
record('sound toggle works + accessible name', soundPressed === 'true' && soundPressed2 === 'false' && !!(await ev(`document.querySelector('.sound').getAttribute('aria-label')`)), `aria-pressed ${soundPressed} -> ${soundPressed2}`);

// background track: turn sound on and confirm the media element actually plays
await ev(`document.querySelector('.sound').click()`);
await sleep(600);
const readHowls = `(()=>{const H=window.Howler;if(!H)return JSON.stringify({missing:true});return JSON.stringify({ctx:H.ctx?H.ctx.state:'none',howls:(H._howls||[]).map(h=>({state:h.state(),playing:h.playing(),loop:!!h._loop,html5:!!h._html5,src:String(h._src||''),seek:h.seek(),dur:h.duration()}))});})()`;
const mediaBefore = await ev(readHowls);
await sleep(2500);
const mediaAfter = await ev(readHowls);
const mb = JSON.parse(mediaBefore), ma = JSON.parse(mediaAfter);
const droneB = (mb.howls || []).find(h => h.loop), droneA = (ma.howls || []).find(h => h.loop);
record('background audio loads (Wednesday track)', !!droneB && droneB.state === 'loaded' && droneB.src.includes('Wednesday'), JSON.stringify(mb));
record('audio playback advances while sound is ON', !!droneB && !!droneA && droneB.playing && droneA.seek > droneB.seek, `seek ${droneB && droneB.seek} -> ${droneA && droneA.seek}`);
await ev(`document.querySelector('.sound').click()`);

// 4. responsive viewports: no horizontal overflow, screenshots of the main experience
await ev(`window.scrollTo(0, 0)`);
await sleep(800);
const viewports = [[375, 812, 'mobile'], [768, 1024, 'tablet'], [1440, 900, 'desktop'], [1920, 1080, 'wide']];
for (const [w, h, label] of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await sleep(1500);
  const overflow = await ev(`({sw:document.documentElement.scrollWidth, iw:window.innerWidth})`);
  record(`no horizontal overflow @ ${label} ${w}x${h}`, overflow.sw <= overflow.iw + 1, `scrollWidth ${overflow.sw} vs innerWidth ${overflow.iw}`);
  await shot(`04-${label}-${w}x${h}.png`);
}
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(800);

// 5. story panels must not collide with the fixed hero once the descent starts
await ev(`window.scrollTo(0, (document.documentElement.scrollHeight-window.innerHeight)*0.25)`);
await sleep(1200);
const heroFade = await ev(`getComputedStyle(document.querySelector('.hero')).opacity`);
record('hero fades out while scrolling', parseFloat(heroFade) === 0, `hero opacity ${heroFade} at 25% scroll`);
await shot('05-midscroll-story.png');
await ev(`window.scrollTo(0, 0)`);
await sleep(1200);

// 6. enter flow
await ev(`document.querySelector('.enter').click()`);
await sleep(3600);
const enteredState = await ev(`JSON.stringify({arrival:!!document.querySelector('.arrival'),entering:document.body.classList.contains('mafias-entering'),hero:!!document.querySelector('.hero')})`);
const es = JSON.parse(enteredState);
record('enter flow completes cleanly', es.arrival && !es.entering && !es.hero, enteredState);
await shot('03-arrival.png');

// 7. camera still responds to scroll after entering
const zA = await ev(`window.__MAFIAS__.camera.position.z`);
await ev(`window.scrollTo(0, (document.documentElement.scrollHeight-window.innerHeight))`);
await sleep(2500);
const zB = await ev(`window.__MAFIAS__.camera.position.z`);
record('camera still scroll-driven after ENTER', typeof zA === 'number' && typeof zB === 'number' && Math.abs(zB - zA) > 2, `z ${zA && zA.toFixed(2)} -> ${zB && zB.toFixed(2)}`);
const insideScene = typeof zB === 'number' && zB > -18;
record('post-enter camera stays inside the graveyard', insideScene, `z ${zB && zB.toFixed(2)}`);

// 8. fresh page renders without crashing (the no-WebGL fallback is covered by the jsdom tests)
const noGl = await (async () => {
  const r = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
  return r.json();
})();
const ws2 = new WebSocket(noGl.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws2.addEventListener('open', res, { once: true }); ws2.addEventListener('error', rej, { once: true }); });
let id2 = 0; const p2 = new Map(); const errs2 = [];
ws2.addEventListener('message', (ev2) => {
  const m = JSON.parse(ev2.data);
  if (m.id && p2.has(m.id)) { const { res, rej } = p2.get(m.id); p2.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errs2.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send2 = (method, params = {}) => new Promise((res, rej) => { const i = ++id2; p2.set(i, { res, rej }); ws2.send(JSON.stringify({ id: i, method, params })); });
await send2('Page.enable'); await send2('Runtime.enable');
let summary = null;
for (let i = 0; i < 20 && !summary; i++) {
  await sleep(1000);
  const r = await send2('Runtime.evaluate', { expression: `(()=>{const root=document.getElementById('root');if(!root||!root.children.length||!document.querySelector('.hero'))return null;return JSON.stringify({canvas:!!document.querySelector('canvas'),fallback:!!document.querySelector('.fallback'),hero:!!document.querySelector('.hero'),rootChildren:root.children.length});})()`, returnByValue: true });
  if (!r.exceptionDetails && r.result.value) summary = r.result.value;
}
record('page renders (root has content, hero present)', !!summary && JSON.parse(summary).rootChildren > 0, summary || 'root never populated');
record('no unhandled exceptions', pageErrors.length === 0 && errs2.length === 0, [...pageErrors, ...errs2].slice(0, 3).join(' | ') || 'none');
const audioNoise = consoleErrors.filter(e => !/audio|dark-drone|graveyard-whoosh|404|Failed to load resource/i.test(e));
record('no console errors (optional-audio 404s excluded)', audioNoise.length === 0, audioNoise.length ? audioNoise.slice(0, 5).join(' | ') : 'none');
record('missing audio handled gracefully', consoleErrors.every(e => /audio|drone|whoosh|404|resource/i.test(e)) , consoleErrors.slice(0, 4).join(' | ') || 'no audio messages at all');

const failed = results.filter(r => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
ws2.close();
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
