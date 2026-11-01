import { Howl, Howler } from "howler";

const audioFiles = {
  nameToDetails: "/audio/registration/transitions/name-to-details.mp3",
  detailsToCharacter: "/audio/registration/transitions/details-to-character.mp3",
  characterToReview: "/audio/registration/transitions/character-to-review.mp3",
  reverseTransition: "/audio/registration/transitions/reverse-transition.mp3",
  portal: "/audio/registration/character/portal-activation.mp3",
  characterReveal: "/audio/registration/character/character-reveal.mp3",
  gender: "/audio/registration/character/gender-select.mp3",
  tagSelect: "/audio/registration/character/tag-select.mp3",
  tagRed: "/audio/registration/character/tag-red.mp3",
  tagBrown: "/audio/registration/character/tag-brown.mp3",
  tagOrange: "/audio/registration/character/tag-orange.mp3",
  smokeImpact: "/audio/registration/atmosphere/smoke-impact.mp3",
  batFlutter: "/audio/registration/atmosphere/bat-flutter.mp3",
  graveyardWind: "/audio/registration/atmosphere/graveyard-wind.mp3",
  submission: "/audio/registration/submission/submission-build.mp3",
  success: "/audio/registration/submission/registration-success.mp3",
};

let enabled = false;
const howls = {};
const instances = new Set();

function createHowl(key) {
  if (howls[key]) return howls[key];
  const src = audioFiles[key];
  if (!src) {
    console.error(`[REG_AUDIO] No file for key: ${key}`);
    return null;
  }
  console.log(`[REG_AUDIO] Creating Howl for ${key}: ${src}`);
  const howl = new Howl({
    src: [src],
    preload: true,
    html5: true,
    onload: () => console.log(`[REG_AUDIO] Loaded: ${key}`),
    onloaderror: (id, err) => console.error(`[REG_AUDIO] Load error for ${key}:`, err),
    onplay: () => console.log(`[REG_AUDIO] Playing: ${key}`),
    onplayerror: (id, err) => console.error(`[REG_AUDIO] Play error for ${key}:`, err),
  });
  howls[key] = howl;
  return howl;
}

// Preload all sounds
Object.keys(audioFiles).forEach(createHowl);

export async function enableAudio() {
  try {
    console.log(`[REG_AUDIO] Enabling audio, ctx state:`, Howler.ctx?.state);
    if (Howler.ctx && Howler.ctx.state === "suspended") {
      await Howler.ctx.resume();
      console.log(`[REG_AUDIO] Resumed ctx, new state:`, Howler.ctx.state);
    }
    if (Howler.ctx && Howler.ctx.state !== "running") {
      console.error("[REG_AUDIO] AudioContext not running");
      return false;
    }
    enabled = true;
    console.log("[REG_AUDIO] Audio enabled");
    return true;
  } catch (error) {
    console.error("[REG_AUDIO] Unable to enable audio:", error);
    return false;
  }
}

export function disableAudio() {
  console.log("[REG_AUDIO] Disabling audio");
  enabled = false;
  registrationAudio.stopAll();
}

export const registrationAudio = {
  playTransition(name) {
    console.log(`[REG_AUDIO] playTransition: ${name}, enabled: ${enabled}`);
    if (!enabled) return;
    let key;
    if (name === "name-to-details") key = "nameToDetails";
    else if (name === "details-to-character") key = "detailsToCharacter";
    else if (name === "character-to-review") key = "characterToReview";
    else if (name === "reverse-transition") key = "reverseTransition";
    else key = name;
    const howl = createHowl(key);
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.42, id);
    howl.fade(0, 0.42, 100, id);
    instances.add(id);
    return id;
  },

  playSelection(type = "gender") {
    console.log(`[REG_AUDIO] playSelection: ${type}, enabled: ${enabled}`);
    if (!enabled) return;
    const key = type === "gender" ? "gender" : "tagSelect";
    const howl = createHowl(key);
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.28, id);
    instances.add(id);
    return id;
  },

  playTag(color) {
    console.log(`[REG_AUDIO] playTag: ${color}, enabled: ${enabled}`);
    if (!enabled) return;
    const key = `tag${color.charAt(0).toUpperCase() + color.slice(1)}`;
    const howl = createHowl(key);
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.32, id);
    instances.add(id);
    return id;
  },

  playPortal() {
    console.log(`[REG_AUDIO] playPortal, enabled: ${enabled}`);
    if (!enabled) return;
    const howl = createHowl("portal");
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.48, id);
    instances.add(id);
    return id;
  },

  playCharacterReveal() {
    console.log(`[REG_AUDIO] playCharacterReveal, enabled: ${enabled}`);
    if (!enabled) return;
    const howl = createHowl("characterReveal");
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.46, id);
    instances.add(id);
    return id;
  },

  playSubmission() {
    console.log(`[REG_AUDIO] playSubmission, enabled: ${enabled}`);
    if (!enabled) return;
    const howl = createHowl("submission");
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.48, id);
    instances.add(id);
    setTimeout(() => {
      if (!enabled) return;
      const h2 = createHowl("smokeImpact");
      if (h2) {
        const id2 = h2.play();
        h2.volume(0.38, id2);
        instances.add(id2);
      }
    }, 400);
    setTimeout(() => {
      if (!enabled) return;
      const h3 = createHowl("batFlutter");
      if (h3) {
        const id3 = h3.play();
        h3.volume(0.24, id3);
        instances.add(id3);
      }
    }, 600);
    return id;
  },

  playSuccess() {
    console.log(`[REG_AUDIO] playSuccess, enabled: ${enabled}`);
    if (!enabled) return;
    const howl = createHowl("success");
    if (!howl) return;
    const id = howl.play();
    howl.volume(0.52, id);
    instances.add(id);
    return id;
  },

  stopAll() {
    console.log("[REG_AUDIO] stopAll");
    Object.values(howls).forEach(h => {
      try { h.stop(); } catch(e) {}
    });
    instances.clear();
  },

  setEnabled(val) {
    if (val) {
      enableAudio().then(ok => {
        if (ok) console.log("[REG_AUDIO] Successfully enabled");
        else console.log("[REG_AUDIO] Failed to enable");
      });
    } else {
      disableAudio();
    }
  },

  isEnabled() {
    return enabled;
  }
};

if (typeof window !== 'undefined') {
  window.registrationAudio = registrationAudio;
  window.enableAudio = enableAudio;
}

export default registrationAudio;
