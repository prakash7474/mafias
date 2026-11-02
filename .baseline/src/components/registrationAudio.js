import { Howl, Howler } from 'howler';

/* ------------------------------------------------------------------ *
 * MAFIAS · registration audio controller.
 *
 * One place owns every one-shot the registration journey plays. It is
 * the same Howler instance the rest of the site uses (Howler keeps a
 * single audio context), so this is not a second audio system.
 *
 * Background ambience is deliberately NOT here: the looping drone and
 * the entrance sting stay in App.jsx and are never touched by this
 * module. Only scene transitions, selections and the confirmation play.
 *
 * Audio is silent until the visitor switches SOUND on. Nothing is even
 * downloaded before that.
 * ------------------------------------------------------------------ */

const BASE = '/audio/registration/';

/*
 * id            file                         gain   fade-in  tail    source / licence
 * --------------------------------------------------------------------------------
 * transition-forward 2623 "Ghostly whoosh passing"   Mixkit Free License
 * transition-back    1088 "Tape rewind cinematic transition"  Mixkit Free License
 * portal-open        2589 "Shot light energy flowing" Mixkit Free License
 * select             2568 "Cool interface click tone" Mixkit Free License
 * submit             1143 "Cinematic whoosh deep impact" Mixkit Free License
 * success            2290 "Epic orchestra transition" Mixkit Free License
 * toggle             3124 "Modern technology select" Mixkit Free License
 */
export const REGISTRATION_CUES = {
  'transition-forward': { file: 'transition-forward.mp3', gain: 0.5, fadeIn: 90, tail: 1500, gap: 260 },
  'transition-back': { file: 'transition-back.mp3', gain: 0.45, fadeIn: 90, tail: 1500, gap: 260 },
  'portal-open': { file: 'portal-open.mp3', gain: 0.46, fadeIn: 260, tail: 2400, gap: 900 },
  select: { file: 'select.mp3', gain: 0.34, fadeIn: 20, tail: 700, gap: 90 },
  submit: { file: 'submit.mp3', gain: 0.55, fadeIn: 60, tail: 2200, gap: 1200 },
  success: { file: 'success.mp3', gain: 0.62, fadeIn: 220, tail: 6500, gap: 0 },
  toggle: { file: 'toggle.mp3', gain: 0.3, fadeIn: 20, tail: 700, gap: 120 },
};

let enabled = false;
const howls = new Map();      // cue id -> Howl
const timers = new Map();     // cue id -> [timeout ids]
const live = new Map();       // cue id -> [play ids]
const lastPlayed = new Map(); // cue id -> performance.now()
let failed = [];

function stopCue(id) {
  const list = timers.get(id);
  if (list) {
    list.forEach((t) => clearTimeout(t));
    timers.delete(id);
  }
  const h = howls.get(id);
  const ids = live.get(id);
  if (h && ids) {
    ids.forEach((playId) => {
      try {
        h.stop(playId);
      } catch (e) {}
    });
  }
  live.delete(id);
}

function ensure(id) {
  if (howls.has(id)) return howls.get(id);
  const cue = REGISTRATION_CUES[id];
  if (!cue) return null;

  const howl = new Howl({
    src: [BASE + cue.file],
    preload: true,
    html5: false,
    volume: cue.gain,
    onloaderror: () => {
      failed.push(cue.file);
      console.info(`[MAFIAS] Registration cue unavailable: ${cue.file} — running silent.`);
    },
    onplayerror: () => {},
  });
  howls.set(id, howl);
  return howl;
}

export function setRegistrationAudioEnabled(next) {
  enabled = !!next;
  if (!enabled) stopAllCues();
}

export function isRegistrationAudioEnabled() {
  return enabled;
}

export function stopAllCues() {
  Object.keys(REGISTRATION_CUES).forEach(stopCue);
}

/* The first click of the journey unlocks the graph on iOS/Safari. */
export function primeRegistrationAudio() {
  if (!enabled) return;
  try {
    if (Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume();
  } catch (e) {}
}

/**
 * Play one cue.
 * - never stacks the same cue (per-cue gap + a new play stops the old one)
 * - fades in, then stops itself after its tail so a 7 s file can't bleed
 *   into the next scene
 * - no-ops entirely while sound is off
 */
export function playRegistrationCue(id, { rate } = {}) {
  if (!enabled) return;
  const cue = REGISTRATION_CUES[id];
  if (!cue) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = lastPlayed.get(id);
  if (last !== undefined && now - last < cue.gap) return;
  lastPlayed.set(id, now);

  const h = ensure(id);
  if (!h) return;

  stopCue(id);

  const playId = h.play();
  if (playId == null) return;
  live.set(id, [playId]);

  h.volume(0, playId);
  if (rate) h.rate(rate, playId);
  h.fade(0, cue.gain, cue.fadeIn, playId);

  const tail = [];
  tail.push(
    setTimeout(() => {
      if (!h.playing(playId)) return;
      h.fade(h.volume(playId) || cue.gain, 0, Math.min(700, cue.tail * 0.25), playId);
      tail.push(setTimeout(() => h.stop(playId), Math.min(760, cue.tail * 0.25) + 40));
    }, cue.tail - Math.min(700, cue.tail * 0.25))
  );
  timers.set(id, tail);
}

export function stopRegistrationAudio() {
  stopAllCues();
}

if (import.meta.env.DEV) {
  // dev-only probe used by the browser audit: which cue is audible?
  window.__MAFIAS_REG_SFX__ = () => {
    const playing = {};
    howls.forEach((h, id) => {
      const ids = live.get(id) || [];
      const n = ids.filter((playId) => h.playing(playId)).length;
      if (n) playing[id] = n;
    });
    return {
      enabled,
      loaded: [...howls.keys()],
      failed,
      playing,
      context: Howler.ctx ? Howler.ctx.state : 'none',
    };
  };
}
