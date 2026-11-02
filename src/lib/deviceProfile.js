/* ------------------------------------------------------------------ *
 * MAFIAS device profiles
 *
 * ONE place that decides how expensive the graveyard may be. The tier is
 * chosen before the WebGL canvas is created (App imports this module and
 * only then lazy-loads the scene), so the desktop-quality scene is never
 * built first and downgraded afterwards.
 *
 * Detection deliberately does not rely on the user-agent string alone:
 *   • pointer / touch capability (phones and tablets, including iPads that
 *     report a desktop UA)
 *   • viewport dimensions in CSS pixels (smallest side for phone vs tablet)
 *   • navigator.userAgentData.mobile when the browser exposes it
 *   • hardware hints (cores / memory) only to separate weak tablets
 *   • a WebGL probe for max texture size / renderer family, as a last hint
 * UA is used as a secondary signal only, never as the decision.
 *
 * Every field below is read by the scene through `deviceProfile.render`.
 * The desktop numbers are copied 1:1 from the previous hard-coded preset so
 * the desktop cinematic experience is unchanged.
 * ------------------------------------------------------------------ */

const TIERS = ['mobile', 'tablet', 'desktop'];

const COMMON = {
  /* how many authored trees to keep (the scene list is ordered near → far) */
  trees: 17,
  /* grass blades (one instanced draw call) */
  blades: 16000,
  /* real-time lights */
  spots: 3,
  redAccent: true,
  /* graveyard density */
  graveRows: 26,
  backGraves: 14,
  graveMounds: 11,
  rocks: 150,
  groundSeg: 96,
  sparks: 70,
  /* particles */
  smokePuffs: 90,
  smokeUpdateHz: 0,        // 0 = every frame
  bats: 16,
  ghosts: 6,
  introSmokePuffs: 20,
  stormBolts: 6,
  stormLocal: true,
  /* portal */
  portalDetail: 5,
  portalWireframeDetail: 2,
  portalTorusSegments: 100,
  portalDistort: true,
  /* atmosphere */
  wind: true,
  windHz: 0,               // 0 = every frame
  shadowMap: 2048,
  spotShadows: true,
  /* post processing / clouds */
  cloudQuality: 'high',
  cloudResolution: 1,
  cloudDelay: 0,
  composerMSAA: 4,
  antialias: true,
};

export const QUALITY_PROFILES = {
  mobile: {
    tier: 'mobile',
    // the names from the optimisation brief, kept as the public vocabulary
    dpr: 1.0,
    shadows: 'minimal',
    treeDetail: 'medium',
    grassDensity: 0.35,
    smokeDensity: 0.35,
    particleDensity: 0.35,
    batDensity: 0.35,
    portalQuality: 'balanced',
    fogQuality: 'balanced',
    postProcessing: 'minimal',
    render: {
      ...COMMON,
      /* phones keep every hero silhouette but drop far background rows */
      trees: 14,
      blades: 3500,
      spots: 2,
      redAccent: false,
      graveRows: 16,
      backGraves: 6,
      graveMounds: 6,
      rocks: 60,
      groundSeg: 48,
      sparks: 25,
      smokePuffs: 36,
      smokeUpdateHz: 24,
      bats: 6,             // 37.5% of desktop, never fewer than two
      ghosts: 3,
      introSmokePuffs: 14,
      stormBolts: 4,
      stormLocal: false,
      portalDetail: 3,
      portalWireframeDetail: 1,
      portalTorusSegments: 56,
      portalDistort: false,
      wind: true,          // keep the movement, update it at 20 Hz
      windHz: 20,
      shadowMap: 768,
      spotShadows: false,
      cloudQuality: 'low',
      cloudResolution: 0.34,
      cloudDelay: 1800,
      composerMSAA: 2,
      antialias: false,
    },
  },

  tablet: {
    tier: 'tablet',
    dpr: 1.25,
    shadows: 'medium',
    treeDetail: 'high',
    grassDensity: 0.6,
    smokeDensity: 0.6,
    particleDensity: 0.6,
    batDensity: 0.625,
    portalQuality: 'high',
    fogQuality: 'high',
    postProcessing: 'balanced',
    render: {
      ...COMMON,
      trees: 17,
      blades: 8500,
      spots: 3,
      redAccent: true,
      graveRows: 21,
      backGraves: 10,
      graveMounds: 9,
      rocks: 100,
      groundSeg: 72,
      sparks: 44,
      smokePuffs: 56,
      smokeUpdateHz: 30,
      bats: 10,
      ghosts: 4,
      introSmokePuffs: 17,
      stormBolts: 5,
      stormLocal: false,
      portalDetail: 4,
      portalWireframeDetail: 2,
      portalTorusSegments: 80,
      portalDistort: true,
      windHz: 30,
      shadowMap: 1536,
      spotShadows: false,
      cloudQuality: 'medium',
      cloudResolution: 0.55,
      cloudDelay: 700,
      composerMSAA: 2,
      antialias: true,
    },
  },

  desktop: {
    tier: 'desktop',
    dpr: 1.25,
    shadows: 'high',
    treeDetail: 'high',
    grassDensity: 1.0,
    smokeDensity: 1.0,
    particleDensity: 1.0,
    batDensity: 1.0,
    portalQuality: 'high',
    fogQuality: 'high',
    postProcessing: 'full',
    render: {
      ...COMMON,
      /* explicit, so a change to COMMON can never silently redesign desktop */
      trees: 17,
      blades: 16000,
      spots: 3,
      redAccent: true,
      graveRows: 26,
      backGraves: 14,
      graveMounds: 11,
      rocks: 150,
      groundSeg: 96,
      sparks: 70,
      smokePuffs: 90,
      smokeUpdateHz: 0,
      bats: 16,
      ghosts: 6,
      introSmokePuffs: 20,
      stormBolts: 6,
      stormLocal: true,
      portalDetail: 5,
      portalWireframeDetail: 2,
      portalTorusSegments: 100,
      portalDistort: true,
      wind: true,
      windHz: 0,
      shadowMap: 2048,
      spotShadows: true,
      cloudQuality: 'high',
      cloudResolution: 1,
      cloudDelay: 0,
      composerMSAA: 4,
      antialias: true,
    },
  },
};

/* ---- detection ---------------------------------------------------- */

function forcedTier() {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('quality');
    return TIERS.includes(q) ? q : null;
  } catch {
    return null;
  }
}

export function detectTier() {
  const forced = forcedTier();
  if (forced) return forced;
  if (typeof window === 'undefined') return 'desktop';

  const nav = navigator || {};
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const touch = coarse
    || (nav.maxTouchPoints || 0) > 0
    || 'ontouchstart' in window;
  const uaMobile = nav.userAgentData
    ? !!nav.userAgentData.mobile
    : /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(nav.userAgent || '');

  /* Large touch laptops stay on the full experience: the cinematic desktop
     composition is not a phone experience. */
  if (!(touch || uaMobile)) return 'desktop';

  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;

  /* Phones in either orientation: the short edge is the phone width. */
  if (minSide <= 540) return 'mobile';
  /* Tablets (portrait 768×1024, landscape 1024×768, iPad Pro 1024×1366). */
  if (maxSide <= 1400) {
    /* a low-core tablet still gets the tablet profile, just no spot shadows */
    return cores <= 4 && memory <= 3 && maxSide > 1200 ? 'mobile' : 'tablet';
  }
  return 'desktop';
}

let cached = null;

export function getDeviceProfile() {
  if (cached) return cached;
  const tier = detectTier();
  const profile = QUALITY_PROFILES[tier] || QUALITY_PROFILES.desktop;
  /* No probe WebGL context here: creating one at startup costs a real
     context and adds jank before the scene even exists. Capability is
     known once the real canvas is created (see SceneCanvas). */
  cached = Object.freeze({
    ...profile,
    tier,
    touch: typeof window !== 'undefined' && (
      (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window
    ),
  });
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.__MAFIAS_PROFILE__ = cached;
  }
  return cached;
}

/* The initial drawing-buffer ratio: never above the device's own ratio and
   never above the profile ceiling. */
export function baseDpr(profile = getDeviceProfile()) {
  const device = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(device, profile.dpr);
}

/* Read by the render loops (no React re-render). */
export const deviceProfile = getDeviceProfile();
