import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://localhost:5210/';
const PORT = '9366';
const profile = path.resolve(`node_modules/.mafias-storm/profile-${Date.now()}`);
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

let id = 0; const pending = new Map();
const pageErrors = []; const consoleErrors = []; const netErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    const t = m.params.entry.text;
    (t.includes('Failed to load resource') ? netErrors : consoleErrors).push(t);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
/* trusted input = real user activation, so audio autoplay rules are exercised */
const clickEl = async (sel) => {
  const r = JSON.parse(await ev(`(()=>{const b=document.querySelector('${sel}');if(!b)return 'null';const q=b.getBoundingClientRect();return JSON.stringify({x:Math.round(q.x+q.width/2),y:Math.round(q.y+q.height/2)});})()`));
  if (r === null) throw new Error('no element ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

/* ---------- boot ---------- */
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__ && window.__MAFIAS__.storm)`)) { booted = true; break; }
  await sleep(500);
}
log(booted ? 'BOOT OK' : 'BOOT FAILED');
if (!booted) { log('PAGE_ERRORS ' + JSON.stringify(pageErrors.slice(0, 5))); ws.close(); chrome.kill(); process.exit(1); }
await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
await sleep(2500);
/* hold the scheduler quiet until the test asks for a strike, so every
   measurement is deterministic */
await ev(`window.__MAFIAS__.storm.setInterval(60,60); true`);
await sleep(400);

/* ---------- in-page probes (synchronous readPixels: no PNG round-trip) ---------- */
const PROBES = `(()=>{
  const M=window.__MAFIAS__;
  window.__probe=()=>{
    const rd=M.renderer,r=rd.domElement,ctx=rd.getContext();
    rd.render(M.scene,M.camera);
    const w=r.width,h=r.height,buf=new Uint8Array(w*h*4);
    ctx.readPixels(0,0,w,h,ctx.RGBA,ctx.UNSIGNED_BYTE,buf);
    let s=0,n=0;
    for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8){const i=(y*w+x)*4;
      s+=0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2];n++;}
    return +(s/n).toFixed(2);
  };
  /* effective visibility = every ancestor visible + where it lands on screen */
  window.__bolt=()=>{
    let out=null;
    M.scene.traverse(o=>{
      if(out||!o.geometry||o.geometry.type!=='TubeGeometry')return;
      let n=o,eff=true;while(n){if(!n.visible){eff=false;break;}n=n.parent;}
      if(!eff)return;
      const v=new (M.camera.position.constructor)();o.getWorldPosition(v);
      const ndc=v.clone().project(M.camera);
      out={world:[+v.x.toFixed(1),+v.y.toFixed(1),+v.z.toFixed(1)],
           ndc:[+ndc.x.toFixed(2),+ndc.y.toFixed(2),+ndc.z.toFixed(2)]};
    });
    return out;
  };
  window.__skyfog=(()=>{
    let sky=null;
    M.scene.traverse(o=>{if(!sky&&o.isMesh&&o.geometry&&o.geometry.type==='SphereGeometry'
      &&o.geometry.parameters&&o.geometry.parameters.radius===90)sky=o.material;});
    return {sky:sky?[+sky.color.r.toFixed(3),+sky.color.g.toFixed(3),+sky.color.b.toFixed(3)].join(','):null,
      fog:M.scene.fog?'#'+M.scene.fog.color.getHexString():null,
      density:M.scene.fog?+M.scene.fog.density.toFixed(5):null};
  });
  /* sample as fast as possible through an event and keep the brightest frame */
  window.__peak=async(ms)=>{
    const t0=performance.now();let best=0,info=null;
    while(performance.now()-t0<ms){
      const st=M.storm.state();
      if(st.env>0.03){
        const l=window.__probe();
        if(l>best){best=l;info={env:st.env,lights:st.lights,bolt:window.__bolt(),sf:window.__skyfog()};}
      }
      await new Promise(r=>setTimeout(r,20));
    }
    return JSON.stringify({best,info});
  };
})()`;
await ev(PROBES);

const state = () => ev(`JSON.stringify(window.__MAFIAS__.storm.state())`).then(JSON.parse);
const probe = () => ev(`window.__probe()`);
const boltNow = () => ev(`JSON.stringify(window.__bolt())`).then(v => JSON.parse(v));
const skyFog = () => ev(`JSON.stringify(window.__skyfog())`).then(JSON.parse);

/* ---------- 1-2. baseline + no flicker ---------- */
/* wait for the storm to be completely quiet first, so the baseline can
   never be contaminated by an in-flight strike */
for (let i = 0; i < 60 && (await state()).active; i++) await sleep(100);
await sleep(700);
const l0 = await probe();
const sf0 = await skyFog();
const s0 = await state();
log('BASELINE luma=' + l0 + ' ' + JSON.stringify(sf0));
check('scene renders (baseline luminance readable)', l0 > 1, 'luma ' + l0);
check('no bolt visible at rest', (await boltNow()) === null, JSON.stringify(await boltNow()));
check('flash lights off at rest', s0.lights.dir === 0 && s0.lights.amb === 0 && s0.lights.local === 0, JSON.stringify(s0.lights));

let fMin = 1e9, fMax = -1e9;
for (let i = 0; i < 12; i++) { const v = await probe(); fMin = Math.min(fMin, v); fMax = Math.max(fMax, v); await sleep(200); }
check('6. dark between strikes, no continuous flicker', (fMax - fMin) < 1.5 && fMax < l0 * 1.1,
  `spread ${(fMax - fMin).toFixed(2)} over 2.4s (min ${fMin} max ${fMax})`);

/* ---------- 3. strike: bolt + illumination ---------- */
await ev(`window.__MAFIAS__.storm.setDuration(2.5); window.__MAFIAS__.storm.strike({region:1,local:true,km:0.9}); true`);
const pk = JSON.parse(await ev(`window.__peak(3400)`));
await ev(`window.__MAFIAS__.storm.setDuration(1); true`);
log('STRIKE ' + JSON.stringify(pk));
const peak = pk.best, info = pk.info || {};

check('1. lightning bolt renders during a strike', !!info.bolt,
  info.bolt ? `visible, world ${info.bolt.world.join(',')}` : 'no bolt visible');
check('2. bolt sits in the distant sky, not in front of the camera',
  !!info.bolt && info.bolt.world[2] < -40 && Math.hypot(...info.bolt.world) < 90,
  info.bolt ? `world ${info.bolt.world.join(',')} (|p|=${Math.hypot(...info.bolt.world).toFixed(1)} < sky r=90)` : 'n/a');
check('2b. bolt is inside the camera frame', !!info.bolt && Math.abs(info.bolt.ndc[0]) < 1 && Math.abs(info.bolt.ndc[1]) < 1,
  info.bolt ? `ndc ${info.bolt.ndc.join(',')}` : 'n/a');
check('3. scene illuminates during the strike', peak > l0 * 1.2 && info.env > 0.3,
  `luma ${l0} → ${peak} (+${((peak / l0 - 1) * 100).toFixed(0)}%) at env ${info.env}`);
check('4. flash lights are driven (global + ambient + local)',
  info.lights && info.lights.dir > 0.2 && info.lights.amb > 0.05 && info.lights.local > 1,
  JSON.stringify(info.lights));
check('5. sky + fog respond', info.sf && info.sf.sky !== sf0.sky && info.sf.fog !== sf0.fog,
  `sky ${sf0.sky}→${info.sf?.sky}, fog ${sf0.fog}→${info.sf?.fog}`);

/* ---------- 4. return to the dark baseline ---------- */
await sleep(3200);
const l1 = await probe(), sf1 = await skyFog(), s1 = await state(), b1 = await boltNow();
check('returns to dark baseline after the flash', Math.abs(l1 - l0) < 1.5 && s1.env === 0,
  `luma ${l1} vs ${l0}, env ${s1.env}`);
check('flash lights fully off after the flash', s1.lights.dir === 0 && s1.lights.amb === 0 && s1.lights.local === 0,
  JSON.stringify(s1.lights));
check('bolt hidden again', b1 === null, JSON.stringify(b1));
check('sky + fog restored exactly', sf1.sky === sf0.sky && sf1.fog === sf0.fog && sf1.density === sf0.density,
  `sky ${sf1.sky}, fog ${sf1.fog}, density ${sf1.density}`);

/* ---------- 5. scheduler on its own ---------- */
await ev(`window.__MAFIAS__.storm.setInterval(5.5,11); true`);
let natural = false;
for (let i = 0; i < 140 && !natural; i++) { natural = (await state()).active; if (!natural) await sleep(100); }
check('scheduler fires events with no interaction', natural, natural ? 'observed a natural strike' : 'none in 14s');
await sleep(2500);

/* ---------- 6. reduced-flash mode ---------- */
await ev(`window.__MAFIAS__.storm.setDuration(3); window.__MAFIAS__.storm.setReduced(true); window.__MAFIAS__.storm.setInterval(1.2,1.2); true`);
let reducedPulses = null;
for (let i = 0; i < 100 && reducedPulses === null; i++) {
  const st = await state();
  if (st.active) reducedPulses = st.pulses;
  else await sleep(30);
}
const reducedPeak = JSON.parse(await ev(`window.__peak(2000)`));
await ev(`window.__MAFIAS__.storm.setDuration(1); window.__MAFIAS__.storm.setReduced(false); window.__MAFIAS__.storm.setInterval(5.5,11); true`);
check('10. reduced-flash mode = single short pulse, no strobe', reducedPulses === 1,
  `pulses in reduced event: ${reducedPulses}`);
check('reduced-flash is visibly dimmer', reducedPeak.best < peak,
  `reduced peak ${reducedPeak.best} vs full ${peak}`);

/* ---------- 6b. deterministic sequence (the audits drive this) ---------- */
await ev(`window.__MAFIAS__.storm.setMode('deterministic'); window.__MAFIAS__.storm.setInterval(1.1,1.1); true`);
const regions = [];
for (let i = 0; i < 70 && regions.length < 3; i++) {
  const st = await state();
  if (st.active && st.region >= 0 && regions[regions.length - 1] !== st.region) regions.push(st.region);
  await sleep(70);
}
await ev(`window.__MAFIAS__.storm.setMode('random'); window.__MAFIAS__.storm.setInterval(5.5,11); true`);
check('deterministic mode cycles strike regions without repeats',
  regions.length >= 3 && new Set(regions).size === regions.length && regions.every(r => r >= 0),
  `sequence ${regions.join(' → ')}`);

/* ---------- 7. flashes toggle (real topbar button) ---------- */
await clickEl('.storm');
await sleep(800); /* let any in-flight event be cancelled by the frame loop */
const flashLabel = await ev(`document.querySelector('.storm').textContent.trim()`);
let firedWhileOff = false;
for (let i = 0; i < 55; i++) { if ((await state()).active) { firedWhileOff = true; break; } await sleep(100); }
await clickEl('.storm');
await ev(`window.__MAFIAS__.storm.setInterval(1,1); true`);
let firedAfterOn = false;
for (let i = 0; i < 70 && !firedAfterOn; i++) { firedAfterOn = (await state()).active; if (!firedAfterOn) await sleep(100); }
await ev(`window.__MAFIAS__.storm.setInterval(5.5,11); true`);
check('flashes toggle: no lightning while OFF', !firedWhileOff, firedWhileOff ? 'a strike happened while off' : `0 strikes in 5.5s (${flashLabel})`);
check('flashes toggle: lightning resumes when ON', firedAfterOn, firedAfterOn ? 'strike after re-enable' : 'no strike in 7s');
const lOff = await probe();
check('scene unaffected when flashes are off', Math.abs(lOff - l0) < 1.5, `luma ${lOff} vs ${l0}`);
await sleep(2500);

/* ---------- 8. thunder sync (trusted click = user gesture) ---------- */
await clickEl('.sound');
await sleep(700);
const soundLabel = await ev(`document.querySelector('.sound').textContent.trim()`);
check('sound toggle works (trusted user gesture)', soundLabel.includes('ON'), soundLabel);

const beforePlay = (await state()).thunderPlayed;
const q = JSON.parse(await ev(`JSON.stringify(window.__MAFIAS__.storm.strike({region:0,km:0.35,local:true}))`));
const stAfter = await state();
check('7. thunder is queued behind the flash, not fired instantly',
  stAfter.thunderPending >= 1 && stAfter.thunderPlayed === beforePlay,
  `delay ${q.km * 3}s, pending ${stAfter.thunderPending}, played ${stAfter.thunderPlayed}`);
await sleep(2500);
const stDone = await state();
check('7b. thunder plays once the delay elapses', stDone.thunderPlayed > beforePlay,
  `played ${stDone.thunderPlayed} (was ${beforePlay})`);
check('7c. thunder queue drains (no per-frame repeats)', stDone.thunderPending === 0, `pending ${stDone.thunderPending}`);

/* ---------- 9. sound off ---------- */
await clickEl('.sound');
await sleep(500);
const offLabel = await ev(`document.querySelector('.sound').textContent.trim()`);
const playedOff = (await state()).thunderPlayed;
await ev(`window.__MAFIAS__.storm.setDuration(3); window.__MAFIAS__.storm.strike({region:3,km:0.4}); true`);
const silentPeak = JSON.parse(await ev(`window.__peak(2400)`));
await ev(`window.__MAFIAS__.storm.setDuration(1); true`);
await sleep(1500);
const stOff = await state();
check('8. sound OFF silences thunder, visuals keep working',
  stOff.thunderPlayed === playedOff && silentPeak.best > l0 * 1.15 && silentPeak.info?.env > 0.2,
  `played ${stOff.thunderPlayed} (was ${playedOff}), luma ${l0}→${silentPeak.best} at env ${silentPeak.info?.env} (${offLabel})`);

/* ---------- 10. camera / scroll integration ---------- */
const camZ0 = await ev(`+window.__MAFIAS__.camera.position.z.toFixed(2)`);
await ev(`window.__MAFIAS__.storm.setDuration(3); window.__MAFIAS__.storm.strike({region:4,local:false}); window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*0.5); true`);
await sleep(3000);
const camMid = await ev(`+window.__MAFIAS__.camera.position.z.toFixed(2)`);
const barMid = await ev(`getComputedStyle(document.querySelector('.scroll-progress')).transform`);
/* fresh strike, sampled while the camera is held mid-scroll */
await ev(`window.__MAFIAS__.storm.setDuration(3); window.__MAFIAS__.storm.strike({region:2,local:true,km:0.7}); true`);
const strikeDuring = JSON.parse(await ev(`window.__peak(2400)`));
await ev(`window.__MAFIAS__.storm.setDuration(1); window.scrollTo(0,0); true`);
await sleep(3000);
const camBack = await ev(`+window.__MAFIAS__.camera.position.z.toFixed(2)`);
check('camera still scroll-driven during lightning', Math.abs(camMid - camZ0) > 4, `z ${camZ0} → ${camMid}`);
check('progress bar tracks scroll during a strike',
  parseFloat(barMid.split(',')[0].replace('matrix(', '')) > .4, barMid);
check('lightning continues while the camera moves (independent systems)', !!strikeDuring.info, `env at sample ${strikeDuring.info?.env}`);
check('lightning never resets the camera', Math.abs(camBack - camZ0) < 2, `z back to ${camBack} (started ${camZ0})`);

/* ---------- 11. existing features ---------- */
const ghostInfo = await ev(`(()=>{const M=window.__MAFIAS__;let mesh=null;
  M.scene.traverse(o=>{if(!mesh&&o.isMesh&&o.geometry&&o.geometry.type==='LatheGeometry')mesh=o;});
  if(!mesh)return 'none';return JSON.stringify({count:(()=>{let n=0;M.scene.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.type==='LatheGeometry')n++;});return n;})(),
    f:mesh.parent?mesh.parent.rotation.y:null});})()`);
await sleep(800);
const ghostInfo2 = await ev(`(()=>{const M=window.__MAFIAS__;let mesh=null;
  M.scene.traverse(o=>{if(!mesh&&o.isMesh&&o.geometry&&o.geometry.type==='LatheGeometry')mesh=o;});
  return mesh&&mesh.parent?String(mesh.parent.rotation.y):'none';})()`);
const gi = ghostInfo === 'none' ? null : JSON.parse(ghostInfo);
const hasMoon = await ev(`(()=>{let n=0;window.__MAFIAS__.scene.traverse(o=>{if(o.geometry&&o.geometry.type==='SphereGeometry'&&o.geometry.parameters.radius===4.2)n++;});return n;})()`);
check('9. ghosts present and still wind-animated', !!gi && gi.count > 0 && gi.f !== null && ghostInfo2 !== 'none' && ghostInfo2 !== String(gi.f),
  `${gi.count} ghosts, flutter ${gi.f} → ${ghostInfo2}`);
check('9b. moon + sky still present', hasMoon === 1, `moon meshes: ${hasMoon}`);

/* ---------- 12. mobile: cost of the storm + overflow ---------- */
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Page.reload');
await sleep(1500);
let mob = false;
for (let i = 0; i < 120; i++) {
  if (await ev(`!!(document.querySelector('canvas') && window.__MAFIAS__ && window.__MAFIAS__.storm)`)) { mob = true; break; }
  await sleep(500);
}
if (!mob) { check('mobile booted', false, 'scene never appeared at 375x812'); }
else {
  await ev(`(document.querySelector('.logo-reveal__skip')||{click(){}}).click()`);
  await sleep(2500);
  await ev(PROBES);
  await ev(`window.__MAFIAS__.storm.setInterval(60,60); true`);
  const measure = () => ev(`new Promise(res=>{
    const d=[];let last=performance.now(),n=0;
    function f(){const now=performance.now();d.push(now-last);last=now;
      if(++n<20)requestAnimationFrame(f);
      else res(+(d.slice(6).reduce((a,b)=>a+b,0)/(d.length-6)).toFixed(1));}
    requestAnimationFrame(f);})`);
  const idleMs = await measure();
  /* one long event covers both frame-time windows and the pixel sample */
  await ev(`window.__MAFIAS__.storm.setDuration(12); window.__MAFIAS__.storm.strike({region:1,local:true,km:0.8}); true`);
  const strikeMs = await measure();
  await ev(`(()=>{const n=[];window.__MAFIAS__.scene.traverse(o=>{if(o.isLight&&o.name&&o.name.indexOf('mafiasFlash')===0){n.push(o);o.visible=false;}});return n.length;})()`);
  const noFlashMs = await measure();
  await ev(`(()=>{window.__MAFIAS__.scene.traverse(o=>{if(o.isLight&&o.name&&o.name.indexOf('mafiasFlash')===0)o.visible=true;});return true;})()`);
  /* fresh strike so the pixel sample lands inside the envelope */
  await ev(`window.__MAFIAS__.storm.setDuration(12); window.__MAFIAS__.storm.strike({region:1,local:true,km:0.8}); true`);
  const mobPeak = JSON.parse(await ev(`window.__peak(2000)`));
  await ev(`window.__MAFIAS__.storm.setDuration(1); true`);
  const rinfo = JSON.parse(await ev(`JSON.stringify(window.__MAFIAS__.renderer.info.render)`));
  log(`MOBILE_TIMING idle=${idleMs}ms strike=${strikeMs}ms strikeNoFlashLights=${noFlashMs}ms`);
  check('11. mobile renders a strike', mobPeak.best > 0 && !!mobPeak.info,
    `luma ${mobPeak.best} at env ${mobPeak.info?.env}, ${rinfo.calls} draw calls, ${rinfo.triangles} tris`);
  check('11b. flash lights cost is measured, not assumed', strikeMs > 0 && noFlashMs > 0,
    `frame time ${idleMs}ms idle / ${strikeMs}ms with flash / ${noFlashMs}ms flash lights hidden (swiftshader, software raster)`);
  const overflow = await ev(`document.documentElement.scrollWidth-window.innerWidth`);
  check('11c. mobile layout has no horizontal overflow', overflow <= 0, `overflow ${overflow}`);
}

/* ---------- 13. errors ---------- */
check('13. no page errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
check('13b. no new console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
if (netErrors.length) log('NETWORK (optional audio files, pre-existing pattern) ' + JSON.stringify(netErrors.slice(0, 4)));

const failed = checks.filter(c => !c.pass);
log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
log(failed.length ? 'RESULT FAIL ' + failed.map(f => f.name).join(' | ') : 'RESULT PASS');
ws.close(); chrome.kill(); process.exit(failed.length ? 1 : 0);
