import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { deviceProfile } from '../lib/deviceProfile.js';
import { liveQuality, subscribeLiveQuality } from '../lib/adaptiveQuality.js';

/* ------------------------------------------------------------------ *
 * SceneCanvas — the one and only WebGL canvas.
 *
 * It is imported lazily by App, so the heavy chunk (three, R3F, drei,
 * postprocessing, the volumetric-cloud library and every procedural
 * generator) no longer blocks the hero text. The desktop DOM and the
 * entrance sequence start immediately; the graveyard arrives underneath.
 *
 * Everything quality-related here comes from the shared device profile:
 * drawing-buffer ratio, antialiasing, camera field of view. The scene
 * itself receives no separate config — it reads the same profile.
 * ------------------------------------------------------------------ */

/* Warm the entrance-smoke textures once the scene module is loaded, while
   the page is idle. The generator is pure canvas work and used to run in
   the middle of the smoke burst; on a phone that was a visible stall. */
const warmSmoke = () => {
  import('./IntroSmoke.jsx')
    .then((m) => {
      const run = () => m.warmIntroSmokeAssets();
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2500 });
      else window.setTimeout(run, 600);
    })
    .catch(() => {});
};

/* Keeps R3F's drawing buffer in sync with the runtime governor. */
function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => subscribeLiveQuality((q) => setDpr(q.dpr)), [setDpr]);
  return null;
}

export default function SceneCanvas({ onReady, onContextLost }) {
  const [frameloop, setFrameloop] = useState('always');
  const glRef = useRef(null);
  const profile = deviceProfile;

  useEffect(() => {
    warmSmoke();
    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => () => { liveQuality.reason = 'unmounted'; }, []);

  const handleCreated = ({ gl }) => {
    glRef.current = gl;
    gl.setClearColor('#07080b', 1);
    if (import.meta.env.DEV) {
      window.__MAFIAS_QUALITY__ = {
        tier: profile.tier,
        level: liveQuality.level,
        dpr: liveQuality.dpr,
        render: profile.render,
      };
    }
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      onContextLost?.();
    }, { once: true });
    onReady?.();
  };

  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, profile.dpr]}
      camera={{ position: [0, 2.7, 12], fov: 48, near: 0.1, far: 220 }}
      gl={{
        antialias: profile.render.antialias,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      onCreated={handleCreated}
    >
      <AdaptiveResolution />
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}

/* Split into its own lazy module so the Canvas chunk stays small and the
   scene chunk can be cached separately by the browser. */
const GraveyardScene = lazy(() => import('./GraveyardScene.jsx'));

function SceneContent() {
  return (
    <Suspense fallback={null}>
      <GraveyardScene />
    </Suspense>
  );
}
