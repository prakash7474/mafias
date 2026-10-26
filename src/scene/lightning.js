import * as THREE from 'three';
import { makeRng } from './procgen.js';

/* ------------------------------------------------------------------ *
 * lightning.js — pure logic, no React, no side effects outside geometry.
 *   1. event timing   → LightningSchedule
 *   2. bolt geometry  → buildBolt / makeBoltPath
 *   3. flash envelope → envelopeAt + makeEvent
 * The Storm component owns everything else (lights, meshes, audio, fog).
 * ------------------------------------------------------------------ */

/* Controls written by App (topbar toggles) and read by Storm every frame.
   Plain module state, so no event plumbing and no lost state on remount. */
export const stormSettings = { sound: false, flashes: true };

/* Single writer (Storm), several readers (the sky dome reads this in its
   own useFrame). Keeps every lightning-driven effect on one clock. */
export const stormState = {
  env: 0,          // 0..1 flash envelope currently in the air
  active: false,   // an event is running
  intensity: 0,    // peak of the running event (0..1, quality-scaled)
  position: new THREE.Vector3()
};

/* Predefined strike origins in the distant sky. They sit behind the tree
   line and beyond the ground disc, so bolts read as sky, never as a UI
   overlay in front of the camera. Distances drive thunder delay. */
export const STRIKE_REGIONS = [
  new THREE.Vector3(-36, 18, -74),
  new THREE.Vector3(-14, 25, -84),
  new THREE.Vector3(-6, 15, -46),
  new THREE.Vector3(30, 20, -78),
  new THREE.Vector3(44, 16, -70)
];

/* Scene units → kilometres. Chosen so strikes land around 0.7–1.2 km,
   which maps to a usable thunder delay (see THUNDER_* below). */
const KM_PER_UNIT = 0.012;
const KM_PER_SECOND_OF_SOUND = 1 / 3; // ~3 s of light-to-sound lag per km
export const THUNDER_DELAY_CAP = 3.2;  // seconds — usability cap

export function distanceKm(pos, from){
  return pos.distanceTo(from) * KM_PER_UNIT;
}
export function thunderDelayFor(km){
  return Math.min(THUNDER_DELAY_CAP, km * 3);
}

/* ------------------------------------------------------------------ *
 * Bolt geometry — fractal midpoint displacement, built ONCE per variant
 * and reused for every strike (never per frame).
 * ------------------------------------------------------------------ */
function subdivide(pts, rng, roughness){
  const out = [];
  for(let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1];
    out.push(a);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
    const seg = a.distanceTo(b);
    mid.x += (rng() - .5) * seg * roughness;
    mid.z += (rng() - .5) * seg * roughness * .7;
    mid.y += (rng() - .5) * seg * roughness * .3;
    out.push(mid);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* Main channel: top at the origin of the strike region, reaching down
   toward the horizon. Roughness halves every pass, so the result is a
   large-scale jag with fine-scale detail. */
export function makeBoltPath(rng, length, iterations = 5){
  let pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((rng() - .5) * length * .12, -length, (rng() - .5) * length * .1)
  ];
  let rough = .55;
  for(let i = 0; i < iterations; i++){
    pts = subdivide(pts, rng, rough);
    rough *= .6;
  }
  return pts;
}

function makeBranchPath(rng, origin, length){
  const ang = rng() * Math.PI * 2;
  const down = .35 + rng() * .55;
  const dir = new THREE.Vector3(Math.cos(ang), -down, Math.sin(ang) * .8).normalize();
  const end = origin.clone().addScaledVector(dir, length);
  let pts = subdivide([origin.clone(), end], rng, .7);
  for(let i = 0; i < 2; i++) pts = subdivide(pts, rng, .5);
  return pts;
}

function lineGeometry(paths){
  const pos = [];
  for(const p of paths){
    for(let i = 0; i < p.length - 1; i++){
      pos.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/* One reusable variant: tube for the glowing core, tube for the softer
   halo, line segments for the branches. Geometries are retained for the
   whole session and disposed with the component. */
export function buildBolt(rng){
  const length = 17 + rng() * 9;
  const main = makeBoltPath(rng, length);
  const curve = new THREE.CatmullRomCurve3(main, false, 'catmullrom', 0);
  const tubular = Math.min(220, main.length * 2);
  const core = new THREE.TubeGeometry(curve, tubular, .05, 6, false);
  const glow = new THREE.TubeGeometry(curve, tubular, .26, 7, false);

  const branchCount = 3 + Math.floor(rng() * 3);
  const paths = [];
  for(let i = 0; i < branchCount; i++){
    const at = main[4 + Math.floor(rng() * (main.length - 8))];
    const len = length * (.14 + rng() * .26);
    paths.push(makeBranchPath(rng, at, len));
  }
  const branches = lineGeometry(paths);
  return { core, glow, branches, length };
}

/* ------------------------------------------------------------------ *
 * Flash envelope: one intense primary flash, up to two weaker
 * follow-ups, then a fast decay to darkness. No strobing: every pulse
 * is a smooth attack followed by a monotonic quadratic decay.
 * ------------------------------------------------------------------ */
function pulseCurve(p, t){
  const rel = t - p.t0;
  if(rel < 0 || rel > p.attack + p.decay) return 0;
  if(rel < p.attack){
    const u = rel / p.attack;
    return p.peak * u * u * (3 - 2 * u);
  }
  const u = (rel - p.attack) / p.decay;
  return p.peak * (1 - u) * (1 - u);
}

export function envelopeAt(event, t){
  let e = 0;
  for(const p of event.pulses){
    const v = pulseCurve(p, t);
    if(v > e) e = v;
  }
  return e;
}

export function makeEvent(rng, opts = {}){
  const pulses = [{ t0: 0, attack: .035, decay: .17, peak: 1 }];
  if(!opts.reduced){
    if(rng() < .72) pulses.push({ t0: .2 + rng() * .18, attack: .03, decay: .22, peak: .42 + rng() * .12 });
    if(rng() < .38) pulses.push({ t0: .52 + rng() * .28, attack: .045, decay: .3, peak: .22 + rng() * .1 });
  }
  const duration = pulses.reduce((m, p) => Math.max(m, p.t0 + p.attack + p.decay), 0);
  return { pulses, duration };
}

/* ------------------------------------------------------------------ *
 * Scheduler — one instance, ticked from the shared frame loop. Never
 * created per render. Two modes:
 *   'random'         → varied quiet intervals and strike regions
 *   'deterministic'  → fixed cadence + cycling regions, for tests
 * ------------------------------------------------------------------ */
export class LightningSchedule {
  constructor({ seed = 9137, mode = 'random', minQuiet = 5.5, maxQuiet = 11, firstQuiet = 2.4, reduced = false } = {}){
    this.rng = makeRng(seed);
    this.mode = mode;
    this.minQuiet = minQuiet;
    this.maxQuiet = maxQuiet;
    this.firstQuiet = firstQuiet;
    this.reduced = reduced;
    this.region = 0;
    this.count = 0;
    this.t = 0;
    this.nextIn = firstQuiet;
    this.lastEvent = null;
  }

  setInterval(min, max){
    this.minQuiet = min;
    this.maxQuiet = Math.max(min, max);
    /* re-schedule the pending strike into the new range, so lengthening the
       quiet gap takes effect immediately instead of riding out a stale
       countdown */
    this.nextIn = min + this.rng() * (this.maxQuiet - min);
  }

  _interval(){
    if(this.mode === 'deterministic') return this.reduced ? this.minQuiet * 2 : this.minQuiet;
    const span = this.maxQuiet - this.minQuiet;
    return this.minQuiet + this.rng() * span;
  }

  _pickRegion(){
    if(this.mode === 'deterministic'){
      this.region = (this.region + 1) % STRIKE_REGIONS.length;
      return this.region;
    }
    let i = Math.floor(this.rng() * STRIKE_REGIONS.length);
    if(i === this.region) i = (i + 1 + Math.floor(this.rng() * (STRIKE_REGIONS.length - 1))) % STRIKE_REGIONS.length;
    this.region = i;
    return i;
  }

  /* Returns a strike descriptor on the frame an event starts, else null. */
  tick(dt, quality){
    this.t += dt;
    this.nextIn -= dt;
    if(this.nextIn > 0) return null;
    this.nextIn = this._interval();
    const region = this._pickRegion();
    const pos = STRIKE_REGIONS[region];
    const env = makeEvent(this.rng, { reduced: this.reduced });
    // closer regions are more likely to be "local" strikes
    const localChance = quality.local ? Math.max(.15, .75 - region * .12) : 0;
    const local = this.rng() < localChance;
    const km = distanceKm(pos, quality.cameraPos);
    const event = {
      ...env,
      region,
      position: pos,
      bolt: this.count % quality.bolts,
      local,
      km,
      thunderDelay: thunderDelayFor(km),
      strength: (this.reduced ? .45 : 1) * (.85 + this.rng() * .3)
    };
    this.count++;
    this.lastEvent = event;
    return event;
  }
}
