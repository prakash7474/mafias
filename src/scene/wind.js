import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Shared wind system — one config, one time source, three consumers:
 *   • ghost pendulum sway (JS side, per-ghost useFrame)
 *   • branch tip movement (vertex shader injected into the bark material)
 *   • grass blade bend   (vertex shader injected into the grass material)
 * No Math.random() inside animation frames: variation comes from
 * deterministic phase offsets per instance/ghost.
 * ------------------------------------------------------------------ */
export const WIND = {
  dir: new THREE.Vector2(0.85, 0.5).normalize(), // coherent wind direction
  base: 1.0,        // base strength multiplier
  gust: 0.5,        // gust amplitude (strength oscillates base ± gust*0.5)
  windSF:0.06,      // gust evolution frequency
  ghostAmp: 0.085,  // rad — max ghost pendulum angle
  branchAmp: 0.055, // world units — max branch-tip displacement
  grassAmp: 0.075   // world units — max grass-tip displacement
};

/* Smooth deterministic gust factor in [0,1]: sum of incommensurate sines.
 * Global — every consumer shares it, so wind feels coherent. */
export function windGust(t){
  const n = Math.sin(t*0.11)*0.45 + Math.sin(t*0.23+1.7)*0.35 + Math.sin(t*0.53+4.1)*0.2;
  return THREE.MathUtils.clamp(WIND.base + n*WIND.gust, 0.25, WIND.base + WIND.gust);
}

/* Shader uniforms for one bent material. bendRef must be an object that
 * lives as long as the material ({uniforms:null}); updateWind fills it. */
export function makeBendUniforms(ref){
  const uniforms = {
    uTime:      { value: 0 },
    uWind:      { value: WIND.dir.clone() },
    uAmp:       { value: 1 }
  };
  ref.uniforms = uniforms;
  return uniforms;
}

/* Registry of live bend shaders; one useFrame call updates all of them. */
const bendShaders = [];

/* Inject wind bend into a MeshStandardMaterial's vertex stage.
 * opts:
 *   ampU      — world-unit max tip displacement (from WIND.*)
 *   heightY   — geometry-space height where the bend reaches full strength
 *   baseY     — geometry-space height where bend starts (clamped below)
 *   uvHeight  — use uv.y (0 base → 1 tip) instead of position.y for the
 *               tip factor (used by the grass quads)
 *   weightExp — curve of the height factor (2 = quadratic tip build-up) */
export function applyWindBend(material, ref, {ampU, heightY=5, baseY=1.2, uvHeight=false, weightExp=2}){
  makeBendUniforms(ref);
  material.onBeforeCompile = (shader)=>{
    shader.uniforms.uTime = ref.uniforms.uTime;
    shader.uniforms.uWind = ref.uniforms.uWind;
    shader.uniforms.uAmp  = { value: ampU };
    shader.uniforms.uHeight = { value: heightY };
    shader.uniforms.uBase   = { value: baseY };
    shader.uniforms.uExp    = { value: weightExp };
    shader.uniforms.uUvMode = { value: uvHeight?1:0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec2 uWind; uniform float uAmp;
        uniform float uHeight; uniform float uBase; uniform float uExp;
        uniform float uUvMode;

        /* deterministic per-instance phase: hash of the instance origin */
        float windPhase(vec2 origin){
          return fract(sin(dot(origin, vec2(12.9898,78.233))) * 43758.5453) * 6.28318;
        }`)
      .replace('#include <project_vertex>', `
        /* ---- wind displacement (world space, before projection) ---- */
        vec4 iOrigin = vec4(0.0);
        #ifdef USE_INSTANCING
          iOrigin = instanceMatrix[3];
        #endif
        float ph = windPhase(iOrigin.xz + vec2(0.0, iOrigin.y*0.7));

        /* shared global gust + a small per-instance desync */
        float gt = uTime*0.55 + ph*0.12;
        float gustF = 0.55 + 0.45*sin(gt)*sin(gt*1.63+2.1);
        float hFactor = uUvMode > 0.5 ? clamp(uv.y, 0.0, 1.0)
                                      : clamp((transformed.y - uBase) / max(uHeight - uBase, 0.001), 0.0, 1.0);
        hFactor = pow(hFactor, uExp);
        float side = 0.78 + 0.22*sin(ph*2.7 + uTime*0.8);   // per-object strength variation
        vec4 localPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
        #endif
        vec4 swayWorld = modelMatrix * localPos;
        swayWorld.xyz += vec3(uWind.x, 0.0, uWind.y) * hFactor * uAmp * side * gustF
                       + vec3(uWind.y, 0.0, -uWind.x) * hFactor * uAmp * 0.3 * gustF * sin(uTime*0.9 + ph);
        vec4 mvPosition = viewMatrix * swayWorld;
        gl_Position = projectionMatrix * mvPosition;
      `);
    bendShaders.push(shader);
  };
  material.customProgramCacheKey = ()=>`windbend-${ampU}-${heightY}-${baseY}-${uvHeight?1:0}-${weightExp}`;
}

/* Called once per frame with the shared clock time. */
export function updateWind(t){
  const g = windGust(t);
  for(const s of bendShaders){
    s.uniforms.uTime.value = t;
  }
  return g; // JS-side consumers (ghosts) reuse the same factor
}

export function clearBendShaders(){
  bendShaders.length = 0;
}
