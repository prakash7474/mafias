/* ------------------------------------------------------------------ *
 * introSmoke — the channel between the entrance timeline (DOM side)
 * and the react-smoke particle field (WebGL side).
 *
 * The timeline writes `ramp` / `alpha` every frame from a GSAP tween's
 * onUpdate. Those are plain mutable numbers read inside the R3F frame
 * loop, so animating the smoke never re-renders the scene graph.
 *
 * Only mount/unmount is React state (`useSyncExternalStore`), because
 * adding or removing the particle field really does change the tree.
 * ------------------------------------------------------------------ */

export const introSmoke = {
  mounted: false, // particle field is in the scene graph
  ramp: 0,        // 0 → 1 expansion of the cloud out of the portal
  alpha: 0        // master opacity of every smoke puff
};

const listeners = new Set();
const emit = () => { for(const fn of listeners) fn(); };

/* Publish the initial "not mounted" state as soon as the module loads. */
syncDom();

export function subscribeIntroSmoke(fn){
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isIntroSmokeMounted(){
  return introSmoke.mounted;
}

/* Snowball reset so a second mount can never inherit the last run's values. */
function reset(){
  introSmoke.ramp = 0;
  introSmoke.alpha = 0;
}

/* Mirrors the mount state onto <html data-intro-smoke> — one attribute, no
   paint cost, and it makes the "no simulation while idle" contract
   observable in DevTools. */
function syncDom(){
  if(typeof document === 'undefined') return;
  document.documentElement.dataset.introSmoke = introSmoke.mounted ? 'on' : 'off';
}

export function mountIntroSmoke(){
  if(introSmoke.mounted) return;
  reset();
  introSmoke.mounted = true;
  syncDom();
  emit();
}

export function unmountIntroSmoke(){
  if(!introSmoke.mounted) return;
  introSmoke.mounted = false;
  introSmoke.alpha = 0;
  syncDom();
  emit();
}
