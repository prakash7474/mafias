import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  stormState, stormSettings, STRIKE_REGIONS, LightningSchedule,
  buildBolt, envelopeAt, distanceKm, makeEvent, thunderDelayFor
} from './lightning.js';
import { ThunderPlayer } from './thunder.js';
import { makeRng, makeSoftTexture } from './procgen.js';

/* ------------------------------------------------------------------ *
 * Storm — the thunderstorm system.
 *
 * One component, one useFrame: the scheduler, the flash envelope, the
 * lights, the bolt, the cloud glow, the fog response and thunder all
 * advance from the same clock, exactly like the wind system. Lightning
 * never looks at scroll progress, so the camera stays free to move.
 *
 * Lighting strategy (an approximation, not a physical simulation):
 *   • a broad directional "sky flash" aimed from the strike direction
 *   • a blue-white ambient fill standing in for scattered cloud light
 *   • an optional local point light for close strikes
 * None of them cast shadows — moonlight keeps the stable shadow map.
 * ------------------------------------------------------------------ */

/* Flash light peaks, kept separate from the envelope so reduced-flash
   mode can scale everything by one number. */
const PEAK = { dir: 2.6, amb: .55, local: 420, glow: .34 };
const FLASH_FOG = new THREE.Color('#4c5f86');
const isSmall = () => typeof window !== 'undefined' && window.innerWidth < 700;

function prefersReduced(){
  return typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Storm({ apiRef, soft }){
  const { camera, scene } = useThree();
  const dirRef = useRef(), ambRef = useRef(), localRef = useRef();
  const glowRef = useRef();
  const groups = useRef([]);
  const boltRng = useMemo(() => makeRng(77321), []);
  const boltCount = isSmall() ? 4 : 6;

  /* Bolt variants are built once and reused for every strike. */
  const bolts = useMemo(() => Array.from({ length: boltCount }, () => buildBolt(boltRng)), [boltCount, boltRng]);
  useEffect(() => () => {
    bolts.forEach(b => { b.core.dispose(); b.glow.dispose(); b.branches.dispose(); });
  }, [bolts]);

  /* Prefer the scene's shared soft texture; only build one if absent. */
  const ownTex = useMemo(() => (soft ? null : makeSoftTexture(128)), [soft]);
  const cloudTex = soft || ownTex;
  useEffect(() => () => { if(ownTex) ownTex.dispose(); }, [ownTex]);

  const mats = useMemo(() => ({
    core: new THREE.MeshBasicMaterial({
      color: '#f2f6ff', transparent: true, opacity: 0, fog: false,
      depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
    }),
    glow: new THREE.MeshBasicMaterial({
      color: '#7ea6ff', transparent: true, opacity: 0, fog: false,
      depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
    }),
    branch: new THREE.LineBasicMaterial({
      color: '#c3d9ff', transparent: true, opacity: 0, fog: false,
      toneMapped: false, blending: THREE.AdditiveBlending
    })
  }), []);
  useEffect(() => () => { mats.core.dispose(); mats.glow.dispose(); mats.branch.dispose(); }, [mats]);

  const reduced = useMemo(prefersReduced, []);
  const schedule = useMemo(() => new LightningSchedule({
    seed: 9137, mode: 'random', minQuiet: 5.5, maxQuiet: 11, firstQuiet: 2.6, reduced
  }), [reduced]);

  const thunder = useRef(null);
  if(!thunder.current) thunder.current = new ThunderPlayer();

  /* Mutable config — debug controls write here without re-rendering. */
  const cfg = useRef({
    enabled: true,
    intensity: 1,
    duration: 1,
    local: !isSmall() && !reduced,
    cloud: true,
    thunder: true,
    kmOverride: null
  });

  const event = useRef(null);   // event currently in the air
  const eventT = useRef(0);
  const fogBase = useRef(null);
  const soundOn = useRef(stormSettings.sound);

  /* Start an event: position the bolt variant and queue its thunder. */
  const start = (ev) => {
    const k = cfg.current.duration;
    if(k !== 1){
      ev.pulses = ev.pulses.map(p => ({
        t0: p.t0 * k,
        attack: Math.max(.02, p.attack * k),
        decay: p.decay * k,
        peak: p.peak
      }));
      ev.duration *= k;
    }
    if(cfg.current.kmOverride != null) ev.km = cfg.current.kmOverride;
    ev.thunderDelay = thunderDelayFor(ev.km);
    event.current = ev;
    eventT.current = 0;
    // public strike info for other systems (clouds, debug hooks):
    // start time, total duration (incl. follow-up flickers) and distance
    stormState.startedAt = performance.now() / 1000;
    stormState.duration = ev.duration;
    stormState.km = ev.km;
    stormState.intensity = ev.strength;
    const g = groups.current[ev.bolt];
    if(g){
      g.position.copy(ev.position);
      g.rotation.y = ev.region * 1.13 + (schedule.mode === 'random' ? boltRng() * .8 - .4 : 0);
      const s = .9 + boltRng() * .35;
      g.scale.set(s, s * (.9 + boltRng() * .3), s);
    }
    if(glowRef.current) glowRef.current.position.copy(ev.position);
    if(cfg.current.thunder) thunder.current.queue(ev.thunderDelay, { km: ev.km, strength: ev.strength });
  };

  /* Dev-only controls: the DEV guard is static, so production builds drop
     this whole block (no debug hooks ship to visitors). */
  useEffect(() => {
    if(!import.meta.env.DEV || !apiRef) return;
    apiRef.current = {
      strike: (opts = {}) => {
        const region = opts.region ?? Math.floor(boltRng() * STRIKE_REGIONS.length);
        const position = STRIKE_REGIONS[region];
        const km = opts.km ?? distanceKm(position, camera.position);
        const env = makeEvent(schedule.rng, { reduced: false });
        start({
          ...env, region, position,
          bolt: opts.bolt ?? Math.floor(boltRng() * bolts.length),
          local: opts.local ?? cfg.current.local,
          km, strength: opts.strength ?? 1
        });
        return { region, km };
      },
      setIntensity: v => { cfg.current.intensity = v; },
      setDuration: v => { cfg.current.duration = v; },
      setInterval: (min, max) => schedule.setInterval(min, max),
      setDistance: km => { cfg.current.kmOverride = km; },
      setLocal: v => { cfg.current.local = !!v; },
      setCloud: v => { cfg.current.cloud = !!v; },
      setThunder: v => { cfg.current.thunder = !!v; },
      setMode: m => { schedule.mode = m; },
      setFlashes: v => { cfg.current.enabled = !!v; },
      setReduced: v => { schedule.reduced = !!v; },
      state: () => ({
        env: +stormState.env.toFixed(3),
        active: stormState.active,
        thunderPending: thunder.current.pending.length,
        thunderPlayed: thunder.current.played,
        sound: soundOn.current,
        flashes: cfg.current.enabled,
        reduced: schedule.reduced,
        pulses: schedule.lastEvent ? schedule.lastEvent.pulses.length : 0,
        region: schedule.lastEvent ? schedule.lastEvent.region : -1,
        nextIn: +schedule.nextIn.toFixed(2),
        mode: schedule.mode,
        lights: {
          dir: +(dirRef.current ? dirRef.current.intensity : 0).toFixed(3),
          amb: +(ambRef.current ? ambRef.current.intensity : 0).toFixed(3),
          local: +(localRef.current ? localRef.current.intensity : 0).toFixed(3)
        }
      })
    };
    return () => { apiRef.current = null; };
  }, [apiRef, camera, schedule, bolts.length]);

  useEffect(() => () => {
    if(scene.fog && fogBase.current){
      scene.fog.color.copy(fogBase.current.color);
      scene.fog.density = fogBase.current.density;
    }
    thunder.current.dispose();
  }, [scene]);

  /* ---- the single shared frame loop ---- */
  useFrame((_, raw) => {
    /* Wall-clock delta, not the physics-clamped one: the scheduler, the flash
       envelope and the thunder delay are all real-time systems and must not
       slow down on a low-framerate device. The envelope gets a much tighter
       clamp so a single slow frame can never step over a flash peak. */
    const dt = Math.min(raw || 0, .5);
    const envDt = Math.min(raw || 0, .1);
    const c = cfg.current;

    /* flashes and sound are driven straight from the topbar state */
    if(stormSettings.paused){
      if(event.current) event.current=null;
      if(glowRef.current?.material)glowRef.current.material.opacity=0;
      for(const group of groups.current)if(group)group.visible=false;
      stormState.env=0; stormState.active=false;
      if(dirRef.current)dirRef.current.intensity=0;
      if(ambRef.current)ambRef.current.intensity=0;
      if(localRef.current)localRef.current.intensity=0;
      if(glowRef.current)glowRef.current.visible=false;
      thunder.current.setEnabled(false);
      return;
    }
    const wantSound = stormSettings.sound && c.thunder;
    if(wantSound !== soundOn.current){ soundOn.current = wantSound; thunder.current.setEnabled(wantSound); }
    c.enabled = stormSettings.flashes;
    if(!c.enabled && event.current){ event.current = null; }

    /* 1. timing — one scheduler, no timers, nothing per render */
    if(c.enabled && !event.current){
      const ev = schedule.tick(dt, { cameraPos: camera.position, bolts: bolts.length, local: c.local });
      if(ev) start(ev);
    }

    /* 2. envelope */
    let env = 0, strength = 0;
    if(event.current){
      eventT.current += envDt;
      env = envelopeAt(event.current, eventT.current);
      strength = event.current.strength;
      if(eventT.current > event.current.duration){
        event.current = null; env = 0; strength = 0;
        stormState.intensity = 0; stormState.duration = 0;
      }
    }

    const e = env * strength * c.intensity;
    stormState.env = e;
    stormState.active = !!event.current;
    if(event.current) stormState.position.copy(event.current.position);

    /* 3. global + local illumination */
    const ev = event.current;
    const att = ev ? THREE.MathUtils.clamp(1.15 - ev.km * .15, .7, 1) : 1;
    if(dirRef.current){
      dirRef.current.intensity = e * PEAK.dir * att;
      if(ev) dirRef.current.position.copy(ev.position);
    }
    if(ambRef.current) ambRef.current.intensity = e * PEAK.amb;
    if(localRef.current) localRef.current.intensity = (ev && ev.local && c.local) ? e * PEAK.local : 0;

    /* 4. bolt + cloud glow */
    for(let i = 0; i < groups.current.length; i++){
      const g = groups.current[i];
      if(g) g.visible = !!ev && ev.bolt === i && env > .002;
    }
    const show = env > .002 ? 1 : 0;
    mats.core.opacity = Math.min(1, env * 1.15) * show;
    mats.glow.opacity = env * .5 * show;
    mats.branch.opacity = env * .85 * show;
    if(glowRef.current){
      glowRef.current.material.opacity = c.cloud ? env * PEAK.glow * att : 0;
      glowRef.current.visible = c.cloud && env > .002;
    }

    /* 5. subtle fog response — returns to the exact baseline at env 0 */
    if(scene.fog){
      if(!fogBase.current) fogBase.current = { color: scene.fog.color.clone(), density: scene.fog.density };
      scene.fog.color.copy(fogBase.current.color).lerp(FLASH_FOG, Math.min(1, e * .5));
      scene.fog.density = fogBase.current.density * (1 + Math.min(1, e) * .22);
    }

    /* 6. thunder — scheduled from this same clock, never per frame */
    thunder.current.tick(dt);
  });

  return (<>
    {/* broad sky flash: aimed from the strike, no shadow map cost */}
    <directionalLight ref={dirRef} name="mafiasFlashDir" position={[-20, 20, -70]} intensity={0} color="#dbe8ff"/>
    {/* scattered cloud light: what actually reveals the graveyard */}
    <ambientLight ref={ambRef} name="mafiasFlashAmbient" intensity={0} color="#9fb9ec"/>
    {/* local strike light — created once at intensity 0 so shaders never recompile */}
    <pointLight ref={localRef} name="mafiasFlashLocal" position={[0, 8, -22]} intensity={0} distance={70} decay={2} color="#cfe0ff"/>

    {bolts.map((b, i) => (
      <group key={i} ref={el => { groups.current[i] = el; }} visible={false}>
        <mesh geometry={b.glow} material={mats.glow}/>
        <mesh geometry={b.core} material={mats.core}/>
        <lineSegments geometry={b.branches} material={mats.branch}/>
      </group>
    ))}

    <sprite ref={glowRef} scale={[54, 30, 1]} visible={false}>
      <spriteMaterial map={cloudTex} color="#a9c4ff" transparent opacity={0}
        depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending}/>
    </sprite>
  </>);
}
