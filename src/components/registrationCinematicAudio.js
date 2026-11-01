import { Howl, Howler } from 'howler';

/* ------------------------------------------------------------------ *
 * MAFIAS · Cinematic registration audio controller
 * Centralized controller for all registration transition sounds
 * ------------------------------------------------------------------ */

const BASE = '/audio/registration/';

export const REG_SOUNDS = {
  // Transitions
  nameToDetails: { file: 'transitions/name-to-details.mp3', gain: 0.42, fadeIn: 100, tail: 1400 },
  detailsToCharacter: { file: 'transitions/details-to-character.mp3', gain: 0.44, fadeIn: 150, tail: 1600 },
  characterToReview: { file: 'transitions/character-to-review.mp3', gain: 0.42, fadeIn: 120, tail: 1500 },
  reverseTransition: { file: 'transitions/reverse-transition.mp3', gain: 0.38, fadeIn: 80, tail: 1300 },
  
  // Character selection
  portalActivation: { file: 'character/portal-activation.mp3', gain: 0.48, fadeIn: 300, tail: 2600 },
  characterReveal: { file: 'character/character-reveal.mp3', gain: 0.46, fadeIn: 200, tail: 2000 },
  genderSelect: { file: 'character/gender-select.mp3', gain: 0.28, fadeIn: 30, tail: 600 },
  tagRed: { file: 'character/tag-red.mp3', gain: 0.32, fadeIn: 40, tail: 700 },
  tagBrown: { file: 'character/tag-brown.mp3', gain: 0.32, fadeIn: 40, tail: 700 },
  tagOrange: { file: 'character/tag-orange.mp3', gain: 0.32, fadeIn: 40, tail: 700 },
  
  // Atmosphere
  graveyardWind: { file: 'atmosphere/graveyard-wind.mp3', gain: 0.26, fadeIn: 400, tail: 3000 },
  smokeImpact: { file: 'atmosphere/smoke-impact.mp3', gain: 0.38, fadeIn: 60, tail: 1400 },
  batFlutter: { file: 'atmosphere/bat-flutter.mp3', gain: 0.24, fadeIn: 80, tail: 1200 },
  
  // Submission
  submissionBuild: { file: 'submission/submission-build.mp3', gain: 0.48, fadeIn: 200, tail: 2400 },
  registrationSuccess: { file: 'submission/registration-success.mp3', gain: 0.52, fadeIn: 250, tail: 5500 },
};

let enabled = false;
const howls = new Map();
const timers = new Map();
const live = new Map();
const lastPlayed = new Map();

function stopSound(id) {
  const list = timers.get(id);
  if (list) {
    list.forEach(t => clearTimeout(t));
    timers.delete(id);
  }
  const h = howls.get(id);
  const ids = live.get(id);
  if (h && ids) {
    ids.forEach(playId => {
      try { h.stop(playId); } catch(e) {}
    });
  }
  live.delete(id);
}function ensure(id) {
  if (howls.has(id)) return howls.get(id);
  const sound = REG_SOUNDS[id];
  if (!sound) return null;
  console.log('[REG_AUDIO] loading', BASE + sound.file);

  const howl = new Howl({
    src: [BASE + sound.file],
    preload: true,
    html5: false,
    volume: sound.gain,
    onload: () => console.log('[REG_AUDIO] loaded', sound.file),
    onloaderror: (id, err) => {
      console.error(`[MAFIAS] Registration sound load error: ${sound.file}`, err);
    },
    onplayerror: (id, err) => { console.error('[REG_AUDIO] play error', err); },
  });
  howls.set(id, howl);
  return howl;
}

export function setRegAudioEnabled(next) {
  enabled = !!next;
  if (enabled) {
    try {
      if (Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume();
    } catch(e) {}
  } else {
    stopAllRegSounds();
  }
}

export function isRegAudioEnabled() {
  return enabled;
}

export function stopAllRegSounds() {
  Object.keys(REG_SOUNDS).forEach(stopSound);
}

export function primeRegAudio() {
  if (!enabled) return;
  try {
    if (Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume();
  } catch(e) {}
}

export function playRegSound(id, options = {}) {
  console.log('[REG_AUDIO] play', id, 'enabled:', enabled);
  if (!enabled) {
    console.log('[REG_AUDIO] disabled, skipping');
    return;
  }
  try {
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      console.log('[REG_AUDIO] resuming context');
      Howler.ctx.resume();
    }
  } catch(e) { console.log('[REG_AUDIO] ctx error', e); }
  const sound = REG_SOUNDS[id];
  if (!sound) {
    console.log('[REG_AUDIO] no sound config for', id);
    return;
  }
  
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = lastPlayed.get(id);
  if (last !== undefined && now - last < 200) return;
  lastPlayed.set(id, now);
  
  const h = ensure(id);
  if (!h) return;
  
  stopSound(id);
  
  const playId = h.play();
  if (playId == null) return;
  live.set(id, [playId]);
  
  h.volume(0, playId);
  if (options.rate) h.rate(options.rate, playId);
  h.fade(0, sound.gain * (options.volume || 1), sound.fadeIn, playId);
  
  const tail = [];
  const fadeOutTime = Math.min(800, sound.tail * 0.3);
  tail.push(setTimeout(() => {
    if (!h.playing(playId)) return;
    h.fade(h.volume(playId) || sound.gain, 0, fadeOutTime, playId);
    tail.push(setTimeout(() => {
      try { h.stop(playId); } catch(e) {}
    }, fadeOutTime + 50));
  }, sound.tail - fadeOutTime));
  timers.set(id, tail);
}

export function stopRegSound(id) {
  stopSound(id);
}
