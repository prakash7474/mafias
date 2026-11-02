/* ------------------------------------------------------------------ *
 * Runtime quality governor
 *
 * The device profile picks the starting quality. This module watches the
 * real frame cadence and takes one or two small steps down if the device
 * cannot hold the target, then steps back up when it can. It never removes
 * an effect: it lowers pixel ratio, cloud buffer resolution and the update
 * cadence of ambient animation.
 *
 * Contract:
 *   • plain mutable state, read inside frame loops — no React re-render
 *   • stable samples (2 s windows) + hysteresis, never per-frame switching
 *   • a minimum floor for every effect (smoke, bats, portal, character)
 *   • at most 2 steps, 4 s apart, so nothing pops while the visitor watches
 * ------------------------------------------------------------------ */

import { deviceProfile, baseDpr } from './deviceProfile.js';

/* level 0 = profile quality, 2 = the floor. Multipliers, not new profiles:
   the authored counts stay intact, only resolution / cadence change. */
export const QUALITY_STEPS = [
  { dpr: 1.0, detail: 1.0, cloud: 1.0 },
  { dpr: 0.85, detail: 0.7, cloud: 0.78 },  // ~28% fewer pixels
  { dpr: 0.72, detail: 0.5, cloud: 0.6 },   // ~48% fewer pixels
];

const listeners = new Set();

export const liveQuality = {
  tier: deviceProfile.tier,
  level: 0,
  dpr: baseDpr(),
  detail: 1,
  cloud: 1,
  reason: 'initial',
};

function recompute() {
  const step = QUALITY_STEPS[liveQuality.level] || QUALITY_STEPS[0];
  /* floor of 0.7 keeps the smallest buffers legible on phones */
  liveQuality.dpr = Math.max(0.7, baseDpr() * step.dpr);
  liveQuality.detail = step.detail;
  liveQuality.cloud = step.cloud;
}

export function subscribeLiveQuality(fn) {
  listeners.add(fn);
  fn(liveQuality);
  return () => listeners.delete(fn);
}

export function setQualityLevel(next, reason = 'monitor') {
  const level = Math.max(0, Math.min(QUALITY_STEPS.length - 1, next));
  if (level === liveQuality.level) return false;
  liveQuality.level = level;
  liveQuality.reason = reason;
  recompute();
  for (const fn of listeners) {
    try { fn(liveQuality); } catch (e) { /* one bad listener must not stop the rest */ }
  }
  return true;
}

/* Targets are deliberately conservative: a phone that holds ~40 fps gets
   the full mobile profile; below ~70% of that for two windows steps down. */
const TARGET_FPS = { mobile: 40, tablet: 45, desktop: 55 };
const WINDOW_MS = 2000;
const WARMUP_MS = 3500;     // shader compilation and asset decode
const COOLDOWN_MS = 4000;
const STEP_DOWN = 0.72;     // of target
const STEP_UP = 0.95;       // of target

export function createPerformanceMonitor(profile = deviceProfile) {
  const target = TARGET_FPS[profile.tier] || 45;
  let windowStart = 0;
  let frames = 0;
  let startedAt = 0;
  let lastChange = 0;
  let badWindows = 0;
  let goodWindows = 0;
  let stopped = false;

  const resetWindow = (now) => {
    windowStart = now;
    frames = 0;
  };

  return {
    /* dt is seconds from useFrame (clamped before it arrives) */
    sample(dt, nowMs = performance.now()) {
      if (stopped) return;
      if (!startedAt) { startedAt = nowMs; resetWindow(nowMs); return; }
      if (typeof document !== 'undefined' && document.hidden) {
        resetWindow(nowMs);
        return;
      }
      /* tab switches / long stalls are not representative frames */
      if (dt > 0.75) { resetWindow(nowMs); return; }

      frames++;
      const elapsed = nowMs - windowStart;
      if (elapsed < WINDOW_MS) return;

      const fps = (frames * 1000) / elapsed;
      resetWindow(nowMs);

      if (nowMs - startedAt < WARMUP_MS) return;

      if (fps < target * STEP_DOWN) {
        badWindows++;
        goodWindows = 0;
      } else if (fps > target * STEP_UP) {
        goodWindows++;
        badWindows = 0;
      } else {
        badWindows = 0;
        goodWindows = 0;
      }

      if (nowMs - lastChange < COOLDOWN_MS) return;

      if (badWindows >= 2 && liveQuality.level < QUALITY_STEPS.length - 1) {
        setQualityLevel(liveQuality.level + 1, `low fps (${fps.toFixed(0)})`);
        lastChange = nowMs;
        badWindows = 0;
      } else if (goodWindows >= 3 && liveQuality.level > 0) {
        setQualityLevel(liveQuality.level - 1, `recovered (${fps.toFixed(0)} fps)`);
        lastChange = nowMs;
        goodWindows = 0;
      }
    },
    stop() { stopped = true; },
    state() {
      return { level: liveQuality.level, fpsTarget: target, dpr: liveQuality.dpr };
    },
  };
}
