import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRng } from './procgen.js';
import { windGust, WIND } from './wind.js';

/* ------------------------------------------------------------------ *
 * Hanging ghosts: procedural cloth silhouettes (lathe) attached to
 * real branch tips recorded by buildTree. Pendulum sway around the
 * branch pivot + slow cloth flutter, all fed by the shared wind.
 * Geometry and materials are built ONCE and shared by every ghost;
 * per-frame code only sets a few rotations — no allocations.
 * ------------------------------------------------------------------ */

const isSmall = () => typeof window !== 'undefined' && window.innerWidth < 700;
const MOBILE = isSmall();
const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Draped silhouette: hood → shoulders → flaring cloth → ragged taper.
   Built as a lathe so folds wrap cleanly around the whole cloth. */
function makeGhostClothGeometry(){
  const profile = [
    [0.005, 0.00],
    [0.150, -0.03],
    [0.240, -0.10],   // hood
    [0.255, -0.22],
    [0.225, -0.34],   // neck / shoulders dip
    [0.300, -0.46],
    [0.360, -0.60],
    [0.330, -0.72],   // upper fold
    [0.400, -0.82],
    [0.345, -0.94],
    [0.270, -1.04],   // ragged fall
    [0.170, -1.14],
    [0.060, -1.22],
    [0.010, -1.28]
  ];
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 22);
  // gentle irregular folds: radius wobble baked into geometry
  const p = g.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.min(1, Math.max(0, -y / 1.28));
    const k = 1 + 0.10 * Math.sin(Math.atan2(z, x) * 3 + t * 9) * t + 0.05 * Math.sin(t * 17);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function pickAnchors(treeGeos, treeDefs, count, seed){
  const rng = makeRng(seed);
  const cands = [];
  treeDefs.forEach((d) => {
    const tips = treeGeos[d.v]?.userData?.tips;
    if(!tips || !tips.length) return;
    // keep ghosts off the camera rail and clear of the headline zone (|x| >= 4.2)
    if(Math.abs(d.x) < 4.2 || d.x > 9.5 || d.z < -15 || d.z > 9) return;
    const cs = Math.cos(d.ry), sn = Math.sin(d.ry);
    for(const [tx, ty, tz] of tips){
      // hang at readable height: anchor on lower side branches only
      const wy = d.y + ty * d.s;
      if(ty < 2.0 || wy < 2.5 || wy > 5.4) continue;
      const wx = d.x + (tx * cs + tz * sn) * d.s;
      const wz = d.z + (-tx * sn + tz * cs) * d.s;
      const lateral = Math.hypot(tx, tz) * d.s;
      if(lateral < 0.8 || lateral > 4) continue;
      cands.push({ x: wx, y: wy, z: wz, lateral });
    }
  });
  // spread along the path: one near-foreground, then middle distance
  const near = cands.filter(c => c.z > 2.5 && c.z < 9.5);
  const mid = cands.filter(c => c.z <= 2.5);
  const chosen = [];
  const take = (pool) => {
    for(let i = 0; i < pool.length && chosen.length < count; i++){
      const c = pool[Math.floor(rng() * pool.length)];
      if(Math.abs(c.x) < 4.4 && c.z > -6) continue;   // never over the headline / portal
      if(chosen.every(o => Math.hypot(o.x - c.x, o.z - c.z) > 2.3)) chosen.push(c);
    }
  };
  if(near.length) take(near);
  take(mid);
  return chosen.slice(0, count);
}

export default function Ghosts({ treeGeos, treeDefs }){
  const built = useMemo(() => {
    const cloth = makeGhostClothGeometry();
    const eyeG = new THREE.SphereGeometry(0.045, 10, 8);
    const ropeG = new THREE.CylinderGeometry(0.007, 0.009, 1, 5); // unit height, scaled per ghost

    const clothM = new THREE.MeshStandardMaterial({
      color: '#dee4f0', roughness: 0.92, metalness: 0,
      transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      depthWrite: false
    });
    const eyeM = new THREE.MeshStandardMaterial({
      color: '#0a0b10', roughness: 0.6, metalness: 0
    });
    const ropeM = new THREE.MeshStandardMaterial({ color: '#17151a', roughness: 0.95, metalness: 0 });

    const count = MOBILE ? 3 : 6;
    const anchors = pickAnchors(treeGeos, treeDefs, count, 777);
    const rng = makeRng(1337);
    const params = anchors.map(() => ({
      ropeLen: 0.65 + rng() * 0.9,
      scale: 0.85 + rng() * 0.5,
      freq: 0.55 + rng() * 0.5,
      phase: rng() * Math.PI * 2,
      flutFreq: 1.1 + rng() * 0.9,
      amp: WIND.ghostAmp * (0.7 + rng() * 0.6),
      ry: (rng() - 0.5) * 1.6          // face roughly along the path
    }));
    return { cloth, eyeG, ropeG, clothM, eyeM, ropeM, params, anchors };
  }, [treeGeos, treeDefs]);
  const { cloth, eyeG, ropeG, clothM, eyeM, ropeM, params, anchors } = built;

  useEffect(() => () => {
    cloth.dispose(); eyeG.dispose(); ropeG.dispose();
    clothM.dispose(); eyeM.dispose(); ropeM.dispose();
  }, [built]);

  const swayRefs = useRef([]);
  const flutterRefs = useRef([]);
  const slow = useRef(reduced());
  useEffect(() => { slow.current = reduced(); }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = windGust(t);
    const mot = slow.current ? 0.35 : 1;
    for(let i = 0; i < swayRefs.current.length; i++){
      const s = swayRefs.current[i], f = flutterRefs.current[i], p = params[i];
      if(!s || !p) continue;
      const dir = i % 2 ? 1 : -1;   // micro desync so ghosts never swing in lockstep
      s.rotation.z = Math.sin(t * p.freq + p.phase) * p.amp * (0.55 + 0.45 * g) * dir * mot;
      s.rotation.x = Math.sin(t * p.freq * 0.61 + p.phase * 1.9 + 1.3) * p.amp * 0.5 * mot;
      if(f) f.rotation.y = Math.sin(t * p.flutFreq + p.phase * 2.3) * 0.07 * (0.6 + 0.4 * g) * mot;
    }
  });

  if(!anchors.length) return null;
  return <group>
    {anchors.map((a, i) => {
      const p = params[i];
      return <group key={i} position={[a.x, a.y, a.z]}>
        {/* pendulum pivot = the recorded branch tip itself: tether + cloth rotate together */}
        <group ref={el => (swayRefs.current[i] = el)}>
          <mesh geometry={ropeG} material={ropeM} scale={[1, p.ropeLen, 1]} position={[0, -p.ropeLen / 2, 0]}/>
          <group position={[0, -p.ropeLen, 0]} scale={p.scale} rotation={[0, p.ry, 0]}>
            <group ref={el => (flutterRefs.current[i] = el)}>
              <mesh geometry={cloth} material={clothM}/>
              <mesh geometry={eyeG} material={eyeM} position={[-0.09, -0.6, 0.21]} scale={[1, 1.5, 0.6]}/>
              <mesh geometry={eyeG} material={eyeM} position={[0.09, -0.6, 0.21]} scale={[1, 1.5, 0.6]}/>
            </group>
          </group>
        </group>
      </group>;
    })}
  </group>;
}
