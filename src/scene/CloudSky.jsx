import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { Atmosphere } from '@takram/three-atmosphere/r3f';
import { Clouds } from '@takram/three-clouds/r3f';
import * as THREE from 'three';
import { stormState } from './lightning.js';

/* ------------------------------------------------------------------ *
 * CloudSky — volumetric storm clouds (@takram/three-clouds) wired into
 * the MAFIAS night sky and driven by the existing thunder system.
 *
 * Pipeline notes (verified against the installed package):
 *   • CloudsEffect is a postprocessing Effect, so it lives inside ONE
 *     EffectComposer — the project had none before, so no effects were
 *     merged or reordered.
 *   • `skipRendering={false}` flips the package's SKIP_RENDERING define,
 *     so the effect composites its own cloud buffer over the scene
 *     (inputColor * (1 - a) + clouds). That keeps our sky dome, FogExp2
 *     and lighting untouched: no AerialPerspective, no second sky, no
 *     duplicate atmospheric fog, no daytime sun.
 *   • Clouds read atmosphere LUTs + a transient sun direction from the
 *     Atmosphere context provider (rendered without <Sky>).
 *   • Textures are served from /clouds (copied from the package's own
 *     bundled assets) so nothing is fetched from GitHub at runtime.
 *
 * Lightning: Storm is the single source of truth — it writes
 * stormState.env (flash envelope incl. secondary flickers) and
 * stormState.position (strike location). This component only maps that
 * envelope onto the cloud renderer's *documented* lighting inputs:
 *   • sunDirection — the directional source clouds scatter from
 *   • skyLightScale / groundBounceScale — documented fudge factors
 * The package has no arbitrary transient point-light input for its ray
 * marcher, so this is a synchronised approximation, not a physically
 * simulated lightning source inside the cloud volume.
 * ------------------------------------------------------------------ */

const isSmall = () => typeof window !== 'undefined' && window.innerWidth < 700;
const MOBILE = isSmall();
// Ensure minimal multisampling for postprocessing to work
const MIN_MULTISAMPLING = 2; // Always use at least 2x MSAA for EffectComposer

/* Rest state: clouds lit faintly from the direction of the visible moon.
   Flash state: light swings toward the strike and scales up hard. */
const MOON_DIR = new THREE.Vector3(34, 22, -54).normalize();
const REST_SKY_LIGHT = 0.32;   // barely-visible cloud deck between strikes
const FLASH_SKY_LIGHT = 3.4;   // extra scale at the flash peak
const REST_BOUNCE = 0.35;
const FLASH_BOUNCE = 0.7;

const strikeScratch = new THREE.Vector3();
const dirScratch = new THREE.Vector3();

const asset = (name) => `${import.meta.env.BASE_URL}clouds/${name}`;

function CloudEffects({ atmoRef, cloudsRef }) {
  /* Dev-only inspection hook used by the browser audit (production drops it). */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__CLOUDS__ = { effect: () => cloudsRef.current, atmosphere: () => atmoRef.current };
    return () => { delete window.__CLOUDS__; };
  }, []);

  /* One frame loop: rest lighting → flash response, straight from the
     shared storm clock. No React state, no allocations. */
  useFrame(() => {
    const atmo = atmoRef.current;
    const clouds = cloudsRef.current;
    if (!atmo || !clouds) return;

    const e = stormState.env; // 0..1 envelope written by Storm this frame

    // direction: moon at rest, biased toward the strike while flashing
    strikeScratch.copy(stormState.position);
    if (strikeScratch.lengthSq() < 1e-6) strikeScratch.copy(MOON_DIR);
    else strikeScratch.normalize();
    dirScratch.copy(MOON_DIR).lerp(strikeScratch, Math.min(1, e * 1.4)).normalize();

    // transientStates is what Clouds copies into the effect each frame;
    // write the effect too so this frame's render already sees it
    atmo.sunDirection.copy(dirScratch);
    clouds.sunDirection.copy(dirScratch);
    clouds.skyLightScale = REST_SKY_LIGHT + e * FLASH_SKY_LIGHT;
    clouds.groundBounceScale = REST_BOUNCE + e * FLASH_BOUNCE;

    // slow, continuous drift (set imperatively to be version-proof)
    clouds.localWeatherVelocity.set(0.00045, 0.00016);
    clouds.shapeVelocity.set(0.000012, 0.000004, 0.000002);
  });

  return (
    <EffectComposer multisampling={Math.max(MIN_MULTISAMPLING, MOBILE ? 2 : 4)}>
      <Clouds
        ref={cloudsRef}
        qualityPreset={MOBILE ? 'low' : 'high'}
        resolutionScale={MOBILE ? 0.6 : 1}
        temporalUpscale
        lightShafts={false}
        skipRendering={false}
        coverage={0.63}
        skyLightScale={REST_SKY_LIGHT}
        groundBounceScale={REST_BOUNCE}
        localWeatherTexture={asset('local_weather.png')}
        shapeTexture={asset('shape.bin')}
        shapeDetailTexture={asset('shape_detail.bin')}
        turbulenceTexture={asset('turbulence.png')}
        stbnTexture={asset('stbn.bin')}
      />
    </EffectComposer>
  );
}

export default function CloudSky() {
  const atmoRef = useRef(null);
  const cloudsRef = useRef(null);
  return (
    <Atmosphere ref={atmoRef} correctAltitude>
      <CloudEffects atmoRef={atmoRef} cloudsRef={cloudsRef} />
    </Atmosphere>
  );
}
