/* ------------------------------------------------------------------ *
 * thunder.js — thunder audio for the storm.
 *
 * No thunder audio files ship with this project (see public/audio/
 * README.md), so thunder is synthesised with the Web Audio API: filtered
 * noise plus a low body tone, shaped per strike by apparent distance.
 * Nothing is created until the visitor turns SOUND on (a real user
 * gesture), so autoplay rules are respected and the site keeps working
 * with sound disabled.
 * ------------------------------------------------------------------ */
import { THUNDER_DELAY_CAP } from './lightning.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class ThunderPlayer {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = false;      // mirrors the SOUND button
    this.voices = 0;
    this.pending = [];         // [{due, params}] — scheduled from the frame loop
    this.lastFired = -1e9;
    this.played = 0;
    this.clock = 0;            // seconds, fed by the shared frame loop
    this.maxVoices = 2;
    this.gap = .9;             // never fire thunder on top of fresh thunder
    this.thunderRaw = null;    // fetched public/audio/thunder.mp3
    this.thunderBuffer = null; // decoded recording (synth stays as fallback)
    this._decoding = false;
    this._preloading = false;
    this._preload();
  }

  /* Fetch the thunder recording early. Nothing plays until SOUND is on:
     the buffer is only decoded once the AudioContext exists (i.e. after the
     visitor's gesture). If the file is missing the synthesised rumble stays. */
  _preload(){
    if(this._preloading || typeof fetch !== 'function') return;
    this._preloading = true;
    fetch('/audio/thunder.mp3')
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
      .then(ab => { this.thunderRaw = ab; if(this.ctx) this._decode(); })
      .catch(() => { this.thunderRaw = null; });
  }

  _decode(){
    if(!this.ctx || !this.thunderRaw || this.thunderBuffer || this._decoding) return;
    this._decoding = true;
    const raw = this.thunderRaw.slice(0);   // decodeAudioData detaches its input
    const done = () => { this._decoding = false; };
    try{
      this.ctx.decodeAudioData(raw)
        .then(buf => { this.thunderBuffer = buf; done(); })
        .catch(() => { this.thunderRaw = null; done(); });
    }catch(e){ done(); }
  }

  /* Lazily build the audio graph. Call only from a user gesture path. */
  _ensure(){
    if(this.ctx) return true;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .85;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 3);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      // brown-ish noise: integrated white noise, already a rumble-shaped bed
      let last = 0;
      for(let i = 0; i < len; i++){
        const w = Math.random() * 2 - 1;
        last = (last + .02 * w) / 1.02;
        d[i] = last * 3.2;
      }
      this.noise = buf;
      return true;
    }catch(e){ return false; }
  }

  setEnabled(on){
    const next = !!on;
    if(next === this.enabled) return;
    this.enabled = next;
    if(next){
      if(!this._ensure()){ this.enabled = false; return; }
      if(this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this._decode();
    }else{
      this.pending.length = 0;
      if(this.master){
        try{ this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .02); }catch(e){}
        // restore headroom in case sound is switched back on later
        setTimeout(() => { if(!this.enabled && this.master) this.master.gain.value = .85; }, 120);
      }
    }
  }

  /* Called when a lightning event starts. The delay approximates the
     light-to-sound travel time for the strike distance, capped so the
     visitor is never left waiting. */
  queue(delaySeconds, { km = 1, strength = 1 } = {}){
    if(!this.enabled || !this.ctx) return;
    const d = clamp(delaySeconds, .05, THUNDER_DELAY_CAP + .5);
    this.pending.push({ due: this.clock + d, km, strength });
  }

  /* Advanced by the shared frame loop — no timers, no per-render work. */
  tick(dt){
    this.clock += dt;
    if(!this.enabled || !this.ctx || !this.pending.length) return;
    for(let i = this.pending.length - 1; i >= 0; i--){
      const p = this.pending[i];
      if(p.due > this.clock) continue;
      this.pending.splice(i, 1);
      if(this.voices >= this.maxVoices) continue;
      if(this.clock - this.lastFired < this.gap) continue;
      this.lastFired = this.clock;
      this._fire(p);
    }
  }

  _fire({ km, strength }){
    const ctx = this.ctx;
    if(!ctx) return;
    // a suspended context still holds its schedule (its clock is frozen),
    // so nudge it and keep going — nothing plays until it actually runs
    if(ctx.state !== 'running'){ ctx.resume && ctx.resume().catch(() => {}); if(ctx.state === 'closed') return; }
    const near = clamp(1 - km / 2.6, 0, 1);        // 1 = right overhead
    const t0 = ctx.currentTime + .02;
    // prefer the real recording (public/audio/thunder.mp3), shaped by distance
    if(this.thunderBuffer){
      this._playRecording({ ctx, t0, near, strength });
      this._announce({ km, strength });
      return;
    }
    this._playSynth({ ctx, t0, near, strength });
    this._announce({ km, strength });
  }

  /* One-shot playback of the supplied recording: never loops, exactly one
     voice per strike event. Distance shapes rate, gain and brightness. */
  _playRecording({ ctx, t0, near, strength }){
    const buf = this.thunderBuffer;
    const rate = .8 + near * .35;                 // distant thunder is deeper
    const dur = buf.duration / rate;
    const peak = clamp((.3 + near * .5) * strength, .08, .85);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false;                              // heard once — never loops
    src.playbackRate.value = rate;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + near * 3200;        // distant rolls are muffled
    lp.Q.value = .5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t0);
    // close strikes crack fast, distant ones swell in
    g.gain.exponentialRampToValueAtTime(peak, t0 + .02 + (1 - near) * .3);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);

    src.connect(lp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + .05);
    this.voices++;
    src.onended = () => { this.voices = Math.max(0, this.voices - 1); };
  }

  /* One event → one playback announcement, so the background track ducks
     once per strike and nothing double-fires on the follow-up flickers. */
  _announce({ km, strength }){
    /* One-shot rumble: every voice is scheduled with explicit start/stop
       times, so a strike is heard exactly once — nothing loops. Announce it
       once so the background track can duck underneath the rumble. */
    this.played++;
    if(typeof window !== 'undefined'){
      try{ window.dispatchEvent(new CustomEvent('mafias:thunder', { detail: { km, strength } })); }catch(e){}
    }
  }

  _playSynth({ ctx, t0, near, strength }){
    const peak = clamp((.16 + near * .4) * strength, .05, .6);
    const dur = 2.4 + (1 - near) * 2.2;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200 + near * 1050;         // distant thunder is muffled
    lp.Q.value = .6;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 34;

    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t0);
    // distant rolls in slowly, close strikes hit fast
    g.gain.exponentialRampToValueAtTime(peak, t0 + .05 + (1 - near) * .55);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);

    src.connect(lp).connect(hp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + .1);
    this.voices++;
    src.onended = () => { this.voices = Math.max(0, this.voices - 1); };

    // body: a short descending tone gives the boom its weight
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58 + near * 26, t0);
    osc.frequency.exponentialRampToValueAtTime(32, t0 + dur * .8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(.0001, t0);
    og.gain.exponentialRampToValueAtTime(peak * .55, t0 + .07 + (1 - near) * .4);
    og.gain.exponentialRampToValueAtTime(.0001, t0 + dur * .85);
    osc.connect(og).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);

    // crack — only for strikes close enough to have one
    if(near > .45){
      const c = ctx.createBufferSource();
      c.buffer = this.noise;
      c.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + near * 900;
      bp.Q.value = .8;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(.0001, t0);
      cg.gain.exponentialRampToValueAtTime(peak * .8, t0 + .012);
      cg.gain.exponentialRampToValueAtTime(.0001, t0 + .22);
      c.connect(bp).connect(cg).connect(this.master);
      c.start(t0);
      c.stop(t0 + .3);
    }
  }

  dispose(){
    this.pending.length = 0;
    this.enabled = false;
    if(this.ctx){
      try{ this.ctx.close(); }catch(e){}
    }
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.thunderRaw = null;
    this.thunderBuffer = null;
  }
}
