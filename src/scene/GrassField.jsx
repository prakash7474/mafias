import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WIND, WIND_GLSL, makeBendUniforms, registerWindShader } from './wind.js';
import { groundSurface, makeRng } from './procgen.js';

/* ------------------------------------------------------------------ *
 * Grass field — adapted from the reference ZIP (Grass.js / GrassMaterial.js):
 *   • one shared blade geometry (plane, 1 x JOINTS segments for bending)
 *   • GPU instancing through an InstancedBufferGeometry with per-instance
 *     offset / orientation-quaternion / stretch / half-root-angle attributes
 *   • vertex-shader slerp between the unbent yaw direction and the grown
 *     orientation, exactly like the original, so blades bend smoothly root→tip
 *   • simplex-noise wind travelling along the shared WIND direction
 *   • diffuse + alpha textures from src/resources of the ZIP
 * Differences from the original (the original predates three r150):
 *   • deprecated `Geometry` + Math.random() placement removed — placement is
 *     deterministic and driven by patch regions supplied by the scene
 *   • the unlit custom shader is replaced by a MeshStandardMaterial with an
 *     onBeforeCompile injection, so grass is lit by the same moonlight /
 *     lightning / fog / tone-mapping pipeline as the rest of the graveyard
 *   • roots are placed on the project's own groundSurface() height function
 * ------------------------------------------------------------------ */

const BLADE_W = 0.055;
const BLADE_H = 0.38;
const JOINTS = 5;

const texLoader = new THREE.TextureLoader();

/* simplex noise (webgl-noise, from the reference GrassMaterial.js) */
const SIMPLEX_GLSL = `
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0*fract(p*C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314*(a0*a0 + h*h);
    vec3 g;
    g.x = a0.x*x0.x + h.x*x0.y;
    g.yz = a0.yz*x12.xz + h.yz*x12.yw;
    return 130.0*dot(m,g);
  }`;

function createProceduralTextures(){
  try{
    const size = 256;
    const diffuseCanvas = document.createElement('canvas');
    diffuseCanvas.width = diffuseCanvas.height = size;
    const dctx = diffuseCanvas.getContext('2d');
    if(!dctx) return null;
    const dg = dctx.createLinearGradient(0,0,0,size);
    dg.addColorStop(0, '#b5c08a');
    dg.addColorStop(0.5, '#9aa277');
    dg.addColorStop(1, '#7a8458');
    dctx.fillStyle = dg;
    dctx.fillRect(0,0,size,size);
    // add variation
    for(let i=0;i<2000;i++){
      const x=Math.random()*size,y=Math.random()*size;
      const a=0.02+Math.random()*0.04;
      dctx.fillStyle = Math.random()>0.5?`rgba(140,150,90,${a})`:`rgba(110,120,70,${a})`;
      dctx.fillRect(x,y,2,2);
    }
    const diffuse = new THREE.CanvasTexture(diffuseCanvas);
    diffuse.colorSpace = THREE.SRGBColorSpace;
    diffuse.anisotropy = 4;
    diffuse.wrapS = diffuse.wrapT = THREE.ClampToEdgeWrapping;

    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = alphaCanvas.height = size;
    const actx = alphaCanvas.getContext('2d');
    if(!actx) return null;
    actx.fillStyle = 'white';
    actx.fillRect(0,0,size,size);
    // create blade shape alpha
    actx.fillStyle = 'black';
    actx.beginPath();
    actx.moveTo(size*0.3, size);
    actx.lineTo(size*0.5, size*0.1);
    actx.lineTo(size*0.7, size);
    actx.closePath();
    actx.fill();
    const alpha = new THREE.CanvasTexture(alphaCanvas);
    alpha.colorSpace = THREE.NoColorSpace;
    alpha.wrapS = alpha.wrapT = THREE.ClampToEdgeWrapping;
    return { diffuse, alpha };
  }catch(e){
    return null;
  }
}

function loadBladeTextures(){
  try{
    const proc = createProceduralTextures();
    if(proc) return Promise.resolve(proc);
  }catch(e){}
  const url = (n) => `${import.meta.env.BASE_URL}textures/${n}`;
  const load = (u) => new Promise((res, rej) => texLoader.load(u, res, undefined, rej));
  return Promise.all([load(url('blade_diffuse.jpg')), load(url('blade_alpha.jpg'))])
    .then(([diffuse, alpha]) => {
      diffuse.colorSpace = THREE.SRGBColorSpace;
      diffuse.anisotropy = 4;
      diffuse.wrapS = diffuse.wrapT = THREE.ClampToEdgeWrapping;
      alpha.colorSpace = THREE.NoColorSpace;
      return { diffuse, alpha };
    });
}

/* Texture loading without a Suspense boundary: the scene renders immediately
 * and the blades appear once both maps are decoded. */
function useBladeTextures(){
  const [tex, setTex] = useState(null);
  useEffect(() => {
    let alive = true;
    loadBladeTextures()
      .then((t) => { if (alive) setTex(t); else { t.diffuse.dispose(); t.alpha.dispose(); } })
      .catch((e) => console.info('Grass textures missing (public/textures/blade_*.jpg):', e?.message || e));
    return () => { alive = false; };
  }, []);
  useEffect(() => () => { if (tex) { tex.diffuse.dispose(); tex.alpha.dispose(); } }, [tex]);
  return tex;
}

/* Deterministic scatter over the patch list with a hard exclusion mask.
 * Roots follow the real ground surface so nothing floats. */
function scatter(patches, exclude, count, seed){
  const rng = makeRng(seed);
  const out = new Float32Array(count * 3);
  const quats = new Float32Array(count * 4);
  const stretch = new Float32Array(count);
  const halfSin = new Float32Array(count);
  const halfCos = new Float32Array(count);
  let n = 0;

  const totalW = patches.reduce((s, p) => s + (p.w ?? 1), 0);
  if (!totalW) return null;

  const qYaw = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), q = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0), axisX = new THREE.Vector3(1, 0, 0), axisZ = new THREE.Vector3(0, 0, 1);
  const attempts = count * 6;

  for (let i = 0; i < attempts && n < count; i++){
    // weighted patch pick
    let t = rng() * totalW, p = patches[0];
    for (const pa of patches){ t -= (pa.w ?? 1); if (t <= 0){ p = pa; break; } }
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * p.r;
    const x = p.x + Math.cos(ang) * rad;
    const z = p.z + Math.sin(ang) * rad;
    if (exclude && exclude(x, z)) continue;

    out[n * 3] = x;
    out[n * 3 + 1] = groundSurface(x, z) - 0.015;   // root slightly sunk into the soil
    out[n * 3 + 2] = z;

    // growth direction: yaw around Y (kept separately, as in the ZIP) plus a
    // small random tilt on X/Z, combined into one quaternion per instance
    const yaw = rng() * Math.PI * 2;
    const tiltX = (rng() - 0.5) * 0.5;
    const tiltZ = (rng() - 0.5) * 0.5;
    qYaw.setFromAxisAngle(axisY, yaw);
    qTilt.setFromAxisAngle(axisX, tiltX);
    q.copy(qYaw).multiply(qTilt);
    qTilt.setFromAxisAngle(axisZ, tiltZ);
    q.multiply(qTilt).normalize();

    quats[n * 4] = q.x; quats[n * 4 + 1] = q.y; quats[n * 4 + 2] = q.z; quats[n * 4 + 3] = q.w;
    halfSin[n] = Math.sin(yaw * 0.5);
    halfCos[n] = Math.cos(yaw * 0.5);

    // height variety: a third of the blades are the tall ones (as in the ZIP),
    // patch scale lets edges/paths carry shorter tufts
    const ps = p.s ?? 1;
    const tall = rng() < 0.35;
    stretch[n] = (tall ? 0.45 + rng() * 0.75 : rng() * 0.5) * ps;
    n++;
  }

  if (!n) return null;
  return { count: n, out, quats, stretch, halfSin, halfCos };
}

function buildBladeGeometry(data){
  const base = new THREE.PlaneGeometry(BLADE_W, BLADE_H, 1, JOINTS);
  base.translate(0, BLADE_H / 2, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('normal', base.attributes.normal);
  g.setAttribute('uv', base.attributes.uv);
  const slice = (arr, size, n) => new THREE.InstancedBufferAttribute(arr.subarray(0, n * size), size);
  g.setAttribute('offset', slice(data.out, 3, data.count));
  g.setAttribute('orientation', slice(data.quats, 4, data.count));
  g.setAttribute('stretch', slice(data.stretch, 1, data.count));
  g.setAttribute('halfRootAngleSin', slice(data.halfSin, 1, data.count));
  g.setAttribute('halfRootAngleCos', slice(data.halfCos, 1, data.count));
  g.instanceCount = data.count;
  return g;
}

export default function GrassField({ patches = [], exclude = null, count = 12000, seed = 101 }){
  const tex = useBladeTextures();
  const uniformsRef = useRef({ uniforms: null });
  const data = useMemo(
    () => (patches.length && count > 0 ? scatter(patches, exclude, count, seed) : null),
    [patches, exclude, count, seed]
  );
  const geometry = useMemo(() => (data ? buildBladeGeometry(data) : null), [data]);

  const material = useMemo(() => {
    if (!tex || !geometry) return null;
    const uniforms = makeBendUniforms(uniformsRef.current);
    uniforms.uAmp = { value: WIND.grassAmp };
    uniforms.uSpeed = { value: WIND.grassSpeed };
    uniforms.uBladeHeight = { value: BLADE_H };

    const m = new THREE.MeshStandardMaterial({
      map: tex.diffuse,
      alphaMap: tex.alpha,
      alphaTest: 0.42,          // cutout, never blending: no alpha overdraw
      side: THREE.DoubleSide,
      roughness: 0.94,
      metalness: 0,
      color: new THREE.Color('#9aa277'),  // pale, dry olive under moonlight
      dithering: true
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWind = uniforms.uWind;
      shader.uniforms.uAmp = uniforms.uAmp;
      shader.uniforms.uSpeed = uniforms.uSpeed;
      shader.uniforms.uBladeHeight = uniforms.uBladeHeight;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 offset;
          attribute vec4 orientation;
          attribute float halfRootAngleSin;
          attribute float halfRootAngleCos;
          attribute float stretch;
          uniform float uTime; uniform vec2 uWind; uniform float uAmp;
          uniform float uSpeed; uniform float uBladeHeight;
${WIND_GLSL}
${SIMPLEX_GLSL}
          vec3 rotateByQuat(vec3 v, vec4 q){
            return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
          }
          /* slerp between the unbent yaw direction and the grown orientation —
             smooth root-to-tip bend, from the reference GrassMaterial.js */
          vec4 bladeSlerp(vec4 a, vec4 b, float t){
            float d = dot(a, b);
            if (d < 0.0){ b = -b; d = -d; }
            if (d > 0.9995) return normalize(a + (b - a) * t);
            float th = acos(clamp(d, -1.0, 1.0));
            return (sin((1.0 - t) * th) * a + sin(t * th) * b) / sin(th);
          }
          float bladeFrc(){ return clamp(position.y / uBladeHeight, 0.0, 1.0); }
          vec4 bladeRot(){
            vec4 rest = vec4(0.0, halfRootAngleSin, 0.0, halfRootAngleCos);
            return normalize(bladeSlerp(rest, orientation, bladeFrc()));
          }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          objectNormal = normalize(rotateByQuat(objectNormal, bladeRot()));`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float frc = bladeFrc();
            transformed = vec3(transformed.x, transformed.y * (1.0 + stretch), transformed.z);
            transformed = rotateByQuat(transformed, bladeRot());
            /* per-instance root position on the ground (the mesh itself sits at the origin) */
            transformed += offset;

            /* ---- wind: shared direction + gust, smooth spatial noise ---- */
            float ph = windPhase(offset.xz);
            float gust = windGust(uTime, ph);
            /* travelling simplex field: neighbouring blades move together,
               patches get their own phase, nothing re-randomises per frame */
            float n = snoise(vec2(uTime * uSpeed - offset.x * 0.34,
                                  uTime * uSpeed * 0.8 - offset.z * 0.34));
            float sway = gust * (0.55 + 0.45 * n);
            float bend = frc * frc;                 // root stays planted
            vec3 along  = vec3(uWind.x, 0.0, uWind.y);
            vec3 across = vec3(uWind.y, 0.0, -uWind.x);
            transformed += along  * (bend * uAmp * sway)
                         + across * (bend * uAmp * 0.32 * sway * sin(uTime * 1.7 + ph * 3.0));
          }`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uBladeHeightF;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          /* the reference texture is lawn-green; pull it toward dry straw so
             the blades belong to a dead gothic graveyard */
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 straw = vec3(1.28, 1.02, 0.56) * lum;
          diffuseColor.rgb = mix(diffuseColor.rgb, straw, 0.72);
          /* root shadow: darken toward the base of the blade (the reference
             mixed a bottom colour in; this keeps it inside the lit pipeline) */
          diffuseColor.rgb *= mix(0.58, 1.06, smoothstep(0.0, 0.75, vMapUv.y));`);

      registerWindShader(shader);
      m.userData.windShader = shader;   // dev/inspection hook
    };
    // one program per quality preset, never recompiled per frame
    m.customProgramCacheKey = () => 'mafias-grass-blades';
    return m;
  }, [tex, geometry]);

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);
  useEffect(() => () => { material?.dispose(); }, [material]);

  if (!geometry || !material) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      receiveShadow
      renderOrder={1}
    />
  );
}
