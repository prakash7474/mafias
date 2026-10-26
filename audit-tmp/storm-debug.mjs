import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5210/';
const PORT = '9377';
const profile = path.resolve(`node_modules/.mafias-stormdbg/profile-${Date.now()}`);
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
  throw new Error('not reachable: ' + url);
}
await tries(`http://127.0.0.1:${PORT}/json/version`);
const put = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
const target = await put.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let id = 0; const pending = new Map(); const errs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Runtime.enable');

let boot = false;
for (let i = 0; i < 120; i++) { if (await ev(`!!(window.__MAFIAS__ && window.__MAFIAS__.storm)`)) { boot = true; break; } await sleep(500); }
log('boot=' + boot);
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(2500);
await ev(`window.__MAFIAS__.storm.setInterval(60,60); true`);

log('LIGHTS ' + await ev(`(()=>{const M=window.__MAFIAS__;const out=[];
  M.scene.traverse(o=>{if(o.isLight)out.push([o.type,+o.intensity.toFixed(2),o.visible,o.parent?o.parent.type:'-']);});
  return JSON.stringify(out);})()`));

log('SCENE_CHILDREN ' + await ev(`(()=>{const M=window.__MAFIAS__;
  return JSON.stringify(M.scene.children.map(c=>c.type+(c.visible?'':'(hidden)')));})()`));

// brightness probe + forced light A/B
log('AB ' + await ev(`(async()=>{
  const M=window.__MAFIAS__,gl=M.renderer;
  const probe=()=>{
    gl.render(M.scene,M.camera);
    const url=gl.domElement.toDataURL('image/png');
    return (async()=>{const img=new Image();img.src=url;await img.decode();
      const cv=document.createElement('canvas');cv.width=96;cv.height=54;
      const c=cv.getContext('2d');c.drawImage(img,0,0,96,54);
      const d=c.getImageData(0,0,96,54).data;let s=0;
      for(let i=0;i<d.length;i+=4)s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
      return +(s/(d.length/4)).toFixed(2);})();
  };
  const base=await probe();
  // A: crank every ambient+directional light in the scene
  const saved=[];
  M.scene.traverse(o=>{if(o.isLight){saved.push([o,o.intensity]);
    if(o.isAmbientLight||o.isDirectionalLight)o.intensity=10;}});
  const hot=await probe();
  saved.forEach(([o,v])=>o.intensity=v);
  const back=await probe();
  // B: now drive it through the storm API
  M.storm.strike({region:1,local:true,km:0.9});
  let peak=0,lightNow=null;
  const t0=performance.now();
  while(performance.now()-t0<700){
    const l=await probe();
    if(l>peak){peak=l;lightNow=M.storm.state().lights;}
    await new Promise(r=>setTimeout(r,35));
  }
  const after=await probe();
  return JSON.stringify({base,hot,back,peak,lightNow,after});
})()`));

log('BOLTS ' + await ev(`(()=>{const M=window.__MAFIAS__;const out=[];
  M.scene.traverse(o=>{if(o.geometry&&o.geometry.type==='TubeGeometry'){
    let p=o,eff=true;while(p){if(!p.visible)eff=false;p=p.parent;}
    const w=new (M.camera.position.constructor)();o.getWorldPosition(w);
    out.push({eff,pos:[+w.x.toFixed(1),+w.y.toFixed(1),+w.z.toFixed(1)]});}});
  return JSON.stringify(out.slice(0,4));})()`));

log('ERRORS ' + JSON.stringify(errs.slice(0, 4)));
ws.close(); chrome.kill(); process.exit(0);
