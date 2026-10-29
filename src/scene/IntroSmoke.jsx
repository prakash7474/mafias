import { Suspense, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Smoke } from 'react-smoke';
import * as THREE from 'three';
import { introSmoke, isIntroSmokeMounted, subscribeIntroSmoke } from './introSmoke.js';

/* ------------------------------------------------------------------ *
 * IntroSmoke — the click-triggered red smoke, rendered by react-smoke
 * inside the existing <Canvas>. No second renderer, no second scene.
 *
 * Why this layering:
 *   • react-smoke owns the particle simulation (drift, turbulence, wind,
 *     swirl, bounds) — the part it is actually good at.
 *   • We supply the wisp textures and the material, so the smoke reads
 *     blood red → crimson → almost-black instead of white, and so it
 *     always composites *over* the graveyard (depthTest off). Without
 *     that, near trees would punch through the cloud and the screen
 *     could never be fully covered.
 *   • Expansion and opacity are pushed from the entrance timeline as
 *     plain numbers (see ./introSmoke.js) and applied once per frame —
 *     the React tree is never re-rendered mid-animation.
 *
 * The field is mounted only for the entrance (≈ 0.45s–4.2s) and removed
 * afterwards, so the idle graveyard pays nothing for it.
 * ------------------------------------------------------------------ */

const MOBILE = typeof window !== 'undefined' && window.innerWidth < 700;

/* Particle budget. Fill rate is the real cost: every puff is a
   camera-facing quad, so N puffs covering A screens each cost N x A
   screens of blending per frame. These numbers land near 10 screens of
   overdraw — enough layers to be opaque, light enough to stay smooth.
   (Measured: 56 dense puffs halved the frame rate, this does not.) */
const DENSITY = MOBILE ? 14 : 20;

/* World-space size of one puff and the volume it drifts inside, tuned
   against the real camera (fov 48, sitting at z≈8.3 looking down -Z):
   the field lives ~5 units in front of the lens, where the visible
   height is ~4.5 units and the width ~8 units. */
const SIZE = [3.4, 2.7, 1];
const MIN_BOUNDS = [-5.2, -3.4, -0.8];
const MAX_BOUNDS = [5.2, 3.4, 0.8];
const MAX_VELOCITY = [.55, .4, 0];
const WIND_DIRECTION = [1, 0, 0];
const WIND_STRENGTH = [.05, .02, 0];
const TURBULENCE = [.07, .05, 0];
const PARTICLE_ROTATION = [0, 0, .18];

/* Blood red → deep crimson → burgundy → near-black.
   `alpha` is the per-layer ceiling; the darker tones carry the body of
   the cloud while the bright ones only highlight, which is what keeps
   it from turning into a flat red rectangle. */
const TONES = [
  { color: '#5e0817', alpha: .38 },
  { color: '#7d0a1c', alpha: .36 },
  { color: '#9c0f26', alpha: .30 },
  { color: '#b3122c', alpha: .24 },
  { color: '#d0203a', alpha: .15 },
  { color: '#ee6a7a', alpha: .08 }
];

/* Position of the opaque smoke wall behind the puffs (group-local). The
   puffs themselves are translucent by nature; this is what makes the
   graveyard genuinely disappear instead of merely turning red. */
const BACKDROP_Z = -2.6;
const BACKDROP_SCALE = [34, 24];

/* ---- procedural wisp textures ------------------------------------- *
 * White/alpha only; colour comes from the material. Built once per
 * session (3 canvases) and reused by every puff, so nothing is
 * generated while the transition plays. */
function paintWisp(seed){
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if(!ctx) return null;

  let state = seed + 1;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);

  const body = ctx.createRadialGradient(128, 128, 8, 128, 128, 134);
  body.addColorStop(0, 'rgba(255,255,255,.95)');
  body.addColorStop(.42, 'rgba(255,255,255,.62)');
  body.addColorStop(.74, 'rgba(255,255,255,.2)');
  body.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  // irregular lobes: breaks the clean circle so no flat round gradient shows
  for(let i = 0; i < 15; i++){
    const x = 34 + random() * 188;
    const y = 34 + random() * 188;
    const radius = 16 + random() * 48;
    const lobe = ctx.createRadialGradient(x, y, 0, x, y, radius);
    lobe.addColorStop(0, `rgba(255,255,255,${.16 + random() * .22})`);
    lobe.addColorStop(.58, 'rgba(255,255,255,.08)');
    lobe.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lobe;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // torn edges: nibble the rim so the silhouette never closes into a disc
  ctx.globalCompositeOperation = 'destination-out';
  for(let i = 0; i < 26; i++){
    const angle = random() * Math.PI * 2;
    const dist = 96 + random() * 36;
    const radius = 10 + random() * 30;
    const x = 128 + Math.cos(angle) * dist;
    const y = 128 + Math.sin(angle) * dist;
    const bite = ctx.createRadialGradient(x, y, 0, x, y, radius);
    bite.addColorStop(0, `rgba(0,0,0,${.25 + random() * .4})`);
    bite.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bite;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  return canvas.toDataURL('image/png');
}

/* The dense wall behind the puffs: opaque dark burgundy with crimson
   drift, never a flat fill. Painted once, 512px, no seams to hide
   because it is scaled far beyond the viewport. */
function paintDenseCloud(){
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if(!ctx) return null;

  let state = 4531;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);

  // opaque base — the guarantee that nothing behind reads through, kept
  // deep so the crimson puffs in front still have room to glow
  const base = ctx.createRadialGradient(size * .5, size * .46, size * .04, size * .5, size * .5, size * .78);
  base.addColorStop(0, '#3f0713');
  base.addColorStop(.42, '#2a040d');
  base.addColorStop(.74, '#170208');
  base.addColorStop(1, '#0d0105');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // drifting pockets: brighter crimson near the middle, almost-black outward
  for(let i = 0; i < 90; i++){
    const angle = random() * Math.PI * 2;
    const dist = Math.pow(random(), .7) * size * .52;
    const x = size * .5 + Math.cos(angle) * dist * 1.35;
    const y = size * .46 + Math.sin(angle) * dist;
    const radius = size * (.05 + random() * .17);
    const near = 1 - Math.min(1, dist / (size * .52));
    const tone = near > .45 ? '#6f0c1e' : '#1d0308';
    const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
    blob.addColorStop(0, `${tone}${near > .45 ? 'a8' : 'cc'}`);
    blob.addColorStop(.6, `${tone}55`);
    blob.addColorStop(1, `${tone}00`);
    ctx.fillStyle = blob;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // coarse grain so large areas never band into a flat gradient
  for(let i = 0; i < 2200; i++){
    const x = random() * size, y = random() * size;
    const a = .02 + random() * .05;
    ctx.fillStyle = random() > .5 ? `rgba(190,30,52,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 2 + random() * 5, 2 + random() * 5);
  }

  return canvas.toDataURL('image/png');
}

let cachedWall = null;
function getWallTexture(){
  if(cachedWall) return cachedWall;
  if(typeof document === 'undefined') return null;
  const url = paintDenseCloud();
  if(!url) return null;
  cachedWall = new THREE.TextureLoader().load(url);
  cachedWall.colorSpace = THREE.SRGBColorSpace;
  return cachedWall;
}

let cachedTextures = null;
function getWispTextures(){
  if(cachedTextures) return cachedTextures;
  if(typeof document === 'undefined') return null;
  const built = [0, 1, 2].map(i => paintWisp(i * 977 + 41)).filter(Boolean);
  cachedTextures = built.length ? built : null;
  return cachedTextures;
}

/* Warm the procedural textures up front. Generating them inside the mount
   that the 0.45 s label triggers blocks the main thread for a quarter of a
   second — right at the flash peak, where the frame must stay smooth. The
   caches are module-level, so idle-time generation is all it takes. */
export function warmIntroSmokeAssets(){
  getWispTextures();
  getWallTexture();
}

/* ---- material ------------------------------------------------------ *
 * Created lazily on the library's first material-generator call (it hands
 * us the loaded textures), then kept in `materials` so the frame loop can
 * fade the whole cloud with one pass over a handful of materials. */
function createMaterialField(){
  const materials = [];
  const generator = (index, textures) => {
    if(!materials.length){
      for(const tone of TONES){
        for(const texture of textures){
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: new THREE.Color(tone.color),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            // composite over the graveyard regardless of depth order:
            // a near tree must never cut a hole in the cloud
            depthTest: false,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false
          });
          material.userData.baseAlpha = tone.alpha;
          materials.push(material);
        }
      }
    }
    return materials[index % materials.length];
  };
  return { generator, materials };
}

/* Varied puff sizes: one geometry per particle, deterministic so the
   cloud is identical on every run. Bigger wisps carry the edges, small
   ones drift through the middle. */
const PUFF_SCALE = [1, .72, 1.28, .88, 1.12, .64, 1.4, .8];
function createGeometryField(){
  const geometries = [];
  return (index, { size }) => {
    if(!geometries[index]){
      const geometry = new THREE.PlaneGeometry(size[0], size[1]);
      const s = PUFF_SCALE[index % PUFF_SCALE.length];
      geometry.scale(s, s * (index % 4 === 0 ? .78 : 1), 1);
      geometries[index] = geometry;
    }
    return geometries[index];
  };
}

/* The library overwrites particle.userData in passive effects, but R3F can
   run a frame between commit and those effects. Seed both vectors from a
   subscription that was registered earlier, so that frame is a no-op
   instead of a TypeError inside react-smoke's frame handler. */
function seedParticleState(group){
  if(!group) return;
  group.traverse(object => {
    if(!object.isMesh) return;
    if(!object.userData.velocity) object.userData.velocity = new THREE.Vector3();
    if(!object.userData.turbulence) object.userData.turbulence = new THREE.Vector3();
  });
}

function SmokeField(){
  const group = useRef(null);
  const backdrop = useRef(null);
  const seeded = useRef(false);
  const placed = useRef(false);
  const camera = useThree(s => s.camera);
  const orbVec = useMemo(() => new THREE.Vector3(), []);
  const rayVec = useMemo(() => new THREE.Vector3(), []);
  const textures = useMemo(getWispTextures, []);
  const wallTexture = useMemo(getWallTexture, []);
  const field = useMemo(createMaterialField, []);
  const geometryField = useMemo(createGeometryField, []);

  /* One frame pass: anchoring, seeding, expansion, slow swirl, master fade.
     This is the only writer of this group's transform/opacity: the timeline
     publishes plain numbers through ./introSmoke.js and never touches the
     three.js objects, so expansion has exactly one owner. */
  useFrame(({ clock }) => {
    const g = group.current;
    if(!g) return;

    /* Anchor the whole field on the camera → orb ray ONCE, on the first
       frame. The entrance can start from two poses — the button push
       (camera z≈8.5) or the scroll arrival (camera z≈-1.6) — and the orb
       travels with scroll, so a fixed field would end up behind the lens
       on the second path and the screen would never be covered. */
    if(!placed.current){
      placed.current = true;
      const a = introSmoke.anchor || { x: 0, y: 2.2, z: -4.8 };
      orbVec.set(a.x, a.y, a.z);
      rayVec.copy(orbVec).sub(camera.position);
      const dist = rayVec.length() || 1;
      rayVec.divideScalar(dist);
      // same 5-unit stand-off the design was tuned for when the camera is
      // far away, pulled in (never closer than 3.4) when it arrives close
      const standOff = Math.min(5.1, Math.max(3.4, dist * .55));
      g.position.copy(camera.position).addScaledVector(rayVec, standOff);
    }
    // wait for actual particles — the wall alone is not enough, and the
    // library's own passive effects may not have run yet
    if(!seeded.current){
      const meshCount = g.children.length - 1;
      if(meshCount > 0){
        seedParticleState(g);
        g.traverse(o => { if(o.isMesh) o.frustumCulled = false; });
        seeded.current = true;
      }
    }
    const { ramp, alpha } = introSmoke;
    g.scale.setScalar(.3 + ramp * .9);
    g.rotation.z = ramp * .55 + clock.elapsedTime * .05;
    const fade = Math.min(1, Math.max(0, alpha));
    for(let i = 0; i < field.materials.length; i++){
      const material = field.materials[i];
      material.opacity = material.userData.baseAlpha * fade;
    }
    // the opaque wall trails the puffs, so the cloud keeps reading as
    // wisps in front of density instead of snapping to a flat card
    if(backdrop.current){
      // saturates slightly ahead of the puffs, so the screen is opaque
      // before the 1.45 s mark even if a frame or two runs late
      backdrop.current.material.opacity = Math.pow(fade, .8);
      backdrop.current.rotation.z = -ramp * .18;
    }
  });

  return (
    <group ref={group} position={[0, 2.2, 3.2]}>
      {/* Dense smoke wall: opaque, behind the puffs, far larger than the
          viewport so no screen edge ever cuts it. */}
      <mesh ref={backdrop} name="smoke-wall" position={[0, 0, BACKDROP_Z]} scale={[BACKDROP_SCALE[0], BACKDROP_SCALE[1], 1]}>
        <planeGeometry args={[1, 1]}/>
        <meshBasicMaterial
          map={wallTexture}
          color="#ffffff"
          transparent opacity={0} depthWrite={false} depthTest={false}
          toneMapped={false} fog={false}/>
      </mesh>
      <Suspense fallback={null}>
        <Smoke
          textures={textures ?? undefined}
          density={DENSITY}
          size={SIZE}
          minBounds={MIN_BOUNDS}
          maxBounds={MAX_BOUNDS}
          maxVelocity={MAX_VELOCITY}
          velocityResetFactor={1.1}
          enableFrustumCulling={false}
          enableWind
          windDirection={WIND_DIRECTION}
          windStrength={WIND_STRENGTH}
          enableTurbulence
          turbulenceStrength={TURBULENCE}
          enableRotation
          rotation={PARTICLE_ROTATION}
          particleGeometry={geometryField}
          particleMaterial={field.generator}
          castShadow={false}
          receiveShadow={false}
        />
      </Suspense>
    </group>
  );
}

export default function IntroSmoke(){
  const mounted = useSyncExternalStore(
    subscribeIntroSmoke,
    isIntroSmokeMounted,
    isIntroSmokeMounted
  );
  if(!mounted) return null;
  return <SmokeField/>;
}
