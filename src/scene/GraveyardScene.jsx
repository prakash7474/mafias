import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import {
  makeRng, groundBase, buildGroundGeometry, buildPathGeometry,
  makeTreeGeometries, makeGraveGeometries, makeMoundGeometry, makeRockGeometry,
  makeGroundTextures, makePathTexture,
  makeSoftTexture, makeMoonTexture, makeBarkTexture
} from './procgen.js';

import { stormState } from './lightning.js';
import { WIND, applyWindBend, clearBendShaders, updateWind } from './wind.js';
import GrassField from './GrassField.jsx';
import Ghosts from './Ghosts.jsx';
import Storm from './Storm.jsx';
import CloudSky from './CloudSky.jsx';
import SkullStatue from '../components/SkullStatue.jsx';
import IntroSmoke from './IntroSmoke.jsx';
import { introSmoke } from './introSmoke.js';

const isSmall=()=>typeof window!=='undefined'&&window.innerWidth<700;
const prefersReduced=()=>typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MOBILE=isSmall();
/* Quality preset: fewer lights/shadows/particles and a smaller key shadow
   map on phones, full treatment on desktop. */
const Q=MOBILE
  ?{shadow:1024,spotShadows:false,spots:2,graveRows:18,backGraves:8,trees:11,blades:4200,rocks:70,sparks:35,groundSeg:64,redAccent:false}
  :{shadow:2048,spotShadows:true,spots:3,graveRows:26,backGraves:14,trees:17,blades:12000,rocks:150,sparks:70,groundSeg:96,redAccent:true};

// Scroll-driven camera path: z = CAM_START + CAM_TRAVEL * progress (travel is negative).
const CAM_START=12, CAM_TRAVEL=-18, LOOK_Y0=1.4, LOOK_Y1=.7, LOOK_Z0=-4, LOOK_Z1=-6;
/* Pre-click approach: the scroll carries the camera from the idle pose
   (z 12) down to APPROACH_Z over the first APPROACH_P of the page — close
   enough to the orb that arriving there means "reached the red ball". */
const APPROACH_P=.5, APPROACH_Z=-1.5;
const SWAY_X=1.15, SWAY_Y=.22, SWAY_SPEED=.3;
const PORTAL_Z0=-4.8, PORTAL_Z_TRAVEL=-4;
// after the "cross over" dive the scrollbar keeps working, but from the landing spot
const POST_ENTER_TRAVEL=-3;

/* Fog is a dark blue-grey, slightly lighter than the materials, so mid-ground
   objects separate from the background while the foreground stays crisp.
   Red atmosphere is localised (haze billboards + smoke), never global. */
const FOG_COLOR='#151a26';
const FOG_DENSITY=.0245;
/* Target colour of the sky dome at the peak of a lightning flash:
   brighter than white so toneMapped=false lifts the cloud band briefly. */
const SKY_FLASH=new THREE.Color(2.2,2.5,3.0);

/* ---------------------------------------------------------------- *
 * Shared instanced-mesh helper: one draw call per geometry variant.
 * ---------------------------------------------------------------- */
function Instances({geometry,material,data,castShadow=false,receiveShadow=false,colors=false}){
  const ref=useRef();
  useEffect(()=>{
    const mesh=ref.current;
    if(!mesh||!data.length)return;
    const mat=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),
      pos=new THREE.Vector3(),scl=new THREE.Vector3();
    data.forEach((d,i)=>{
      e.set(d.rx||0,d.ry||0,d.rz||0);
      q.setFromEuler(e);
      pos.set(d.x,d.y,d.z);
      const s=d.s??1;
      if(typeof s==='number')scl.set(s,s,s);else scl.set(s[0],s[1],s[2]);
      mat.compose(pos,q,scl);
      mesh.setMatrixAt(i,mat);
      if(colors&&d.color)mesh.setColorAt(i,d.color);
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();
  },[data,colors]);
  if(!data.length)return null;
  return <instancedMesh ref={ref} args={[geometry,material,data.length]} castShadow={castShadow} receiveShadow={receiveShadow}/>;
}

/* ---------------------------------------------------------------- *
 * Lighting: moon key (shadowed) + back rim + hemisphere fill +
 * three aimed spotlights + portal/accent point lights.
 * ---------------------------------------------------------------- */
function Spot({pos,target,angle,penumbra,intensity,distance,color,castShadow,mapSize}){
  const targetObj=useMemo(()=>{
    const o=new THREE.Object3D();
    o.position.set(target[0],target[1],target[2]);
    return o;
  },[target]);
  return <>
    <primitive object={targetObj}/>
    <spotLight
      position={pos} target={targetObj} angle={angle} penumbra={penumbra}
      intensity={intensity} distance={distance} decay={2} color={color}
      castShadow={!!castShadow}
      shadow-mapSize-width={mapSize} shadow-mapSize-height={mapSize}
      shadow-bias={-.0005} shadow-normalBias={.03}
      shadow-camera-near={1} shadow-camera-far={30}/>
  </>;
}

function SceneLights(){
  const keyRef=useRef();
  // make sure the shadow frustum really covers the graveyard
  useEffect(()=>{
    const l=keyRef.current;
    if(!l)return;
    const c=l.shadow.camera;
    c.left=-19;c.right=19;c.top=19;c.bottom=-19;c.near=2;c.far=70;
    c.updateProjectionMatrix();
    l.shadow.bias=-.0004;
    l.shadow.normalBias=.035;
    if(l.shadow.mapSize.x!==Q.shadow){
      l.shadow.mapSize.set(Q.shadow,Q.shadow);
      l.shadow.map?.dispose();
      l.shadow.map=null;
    }
  },[]);
  return <>
    {/* B. controlled ambient — reveals shape without flattening */}
    <ambientLight intensity={.042} color="#3d4660"/>
    <hemisphereLight intensity={.3} color="#5e6d90" groundColor="#0a0a0e"/>

    {/* A. moonlight: cool key from upper-left, casts coherent shadows */}
    <directionalLight
      ref={keyRef}
      position={[-11,15,7]} intensity={2.8} color="#b9c6e2"
      castShadow
      shadow-mapSize-width={Q.shadow} shadow-mapSize-height={Q.shadow}
      shadow-camera-left={-19} shadow-camera-right={19}
      shadow-camera-top={19} shadow-camera-bottom={-19}
      shadow-camera-near={2} shadow-camera-far={70}
      shadow-bias={-.0004} shadow-normalBias={.035}/>

    {/* C. tree rim light: back-right, aligned with the visible moon, no shadow */}
    <directionalLight position={[16,10,-26]} intensity={1} color="#7f96cc"/>

    {/* D. graveyard spotlights: path pool + two grave highlights */}
    <Spot pos={[-1.5,7.5,6.5]} target={[.6,-.2,1.2]} angle={.5} penumbra={.95}
      intensity={95} distance={26} color="#ccd5ea"
      castShadow={Q.spotShadows} mapSize={1024}/>
    <Spot pos={[-6.5,6,-1.5]} target={[-4.4,.4,-3]} angle={.34} penumbra={1}
      intensity={68} distance={20} color="#d8dbe6"
      castShadow={Q.spotShadows} mapSize={1024}/>
    {Q.spots>2&&
      <Spot pos={[5.6,6,-8]} target={[3.8,.4,-9.6]} angle={.3} penumbra={1}
        intensity={64} distance={18} color="#d3d8e8"
        castShadow={Q.spotShadows} mapSize={1024}/>}

    {/* low red spill on the left rows — echoes the smoke without tinting everything */}
    {Q.redAccent&&<pointLight position={[-6.5,.7,-7.5]} intensity={12} distance={16} decay={2} color="#a40c28"/>}
  </>;
}

/* ---------------------------------------------------------------- *
 * Moon disc + halo, placed on the same side as the rim light.
 * ---------------------------------------------------------------- */
function Moon({soft,moonTex}){
  return <group position={[34,22,-54]}>
    {/* toneMapped=false keeps the disc at full authored brightness under ACES */}
    <mesh><sphereGeometry args={[4.2,32,32]}/><meshBasicMaterial map={moonTex} fog={false} toneMapped={false} color="#fbfcff"/></mesh>
    <sprite scale={[26,26,1]}>
      <spriteMaterial map={soft} color="#b6c6ef" transparent opacity={.85}
        depthWrite={false} fog={false} blending={THREE.AdditiveBlending}/>
    </sprite>
  </group>;
}

/* Localised red haze: static additive billboards placed off the camera rail,
   so red lives in selected regions instead of a global wash. */
function Haze({soft}){
  const items=[
    [-6,1.3,-9,13,4.6,'#7d1126',.075],
    [6.5,1.1,-13,14,4.2,'#6d0e21',.08],
    [0,2.6,-18,22,7.5,'#5f0d1d',.1],
    [-7,.9,-3.5,10,3,'#5e1022',.055],
    [0,1.6,-24,26,9,'#42101e',.085]
  ];
  return <>{items.map(([x,y,z,w,h,c,o],i)=>
    <sprite key={i} position={[x,y,z]} scale={[w,h,1]}>
      <spriteMaterial map={soft} color={c} transparent opacity={o}
        depthWrite={false} fog={false} blending={THREE.AdditiveBlending}/>
    </sprite>)}</>;
}

/* Procedural night sky: vertical gradient, stars, drifting cloud band and a blood-red horizon haze. */
function makeSkyTexture(){
  try{
    const w=1024,h=512;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#141b30');g.addColorStop(.45,'#0f1526');g.addColorStop(.72,'#0e1422');g.addColorStop(1,'#151a26');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    // stars: soft glow blobs + bright cores — tiny 1px dots vanish through texture
    // filtering across a 90-unit sphere, so each star gets a visible halo
    for(let i=0;i<420;i++){
      const x=Math.random()*w,y=Math.random()*h*.46,r=.4+Math.random()*1.6;
      const big=Math.random()<.14,glow=big?12:5+Math.random()*6;
      const core=.35+Math.random()*.5;
      const halo=ctx.createRadialGradient(x,y,0,x,y,glow);
      halo.addColorStop(0,`rgba(214,224,246,${core})`);
      halo.addColorStop(.25,`rgba(170,186,224,${core*.45})`);
      halo.addColorStop(1,'rgba(150,170,220,0)');
      ctx.globalAlpha=1;
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,glow,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=big?'#e8eefc':'#b9c3dd';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<110;i++){
      const x=Math.random()*w,y=h*.04+Math.random()*h*.4,r=26+Math.random()*140;
      const a=.09+Math.random()*.13,cloud=ctx.createRadialGradient(x,y,0,x,y,r);
      cloud.addColorStop(0,`rgba(126,138,172,${a})`);
      cloud.addColorStop(.5,`rgba(70,80,110,${a*.6})`);
      cloud.addColorStop(1,'rgba(16,18,26,0)');
      ctx.fillStyle=cloud;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    // blood-red glow sitting just above the horizon (canvas y = .5h is the horizon)
    const haze=ctx.createLinearGradient(0,h*.3,0,h*.5);
    haze.addColorStop(0,'rgba(122,14,32,0)');haze.addColorStop(1,'rgba(150,18,40,.4)');
    ctx.fillStyle=haze;ctx.fillRect(0,h*.3,w,h*.2);
    // blend into the fog colour at the horizon so the ground edge never shows a hard seam
    const blend=ctx.createLinearGradient(0,h*.4,0,h*.52);
    blend.addColorStop(0,'rgba(21,26,38,0)');blend.addColorStop(1,'rgba(21,26,38,.9)');
    ctx.fillStyle=blend;ctx.fillRect(0,h*.4,w,h*.12);
    ctx.fillStyle='#151a26';ctx.fillRect(0,h*.52,w,h*.48);
    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.wrapS=THREE.RepeatWrapping;
    return tex;
  }catch(e){return null;}
}

function Sky(){
  const ref=useRef(),matRef=useRef();
  const texture=useMemo(makeSkyTexture,[]);
  useEffect(()=>()=>{texture?.dispose();},[texture]);
  useFrame((_,delta)=>{
    if(typeof window!=='undefined'&&window.__MAFIAS_STATIC__!==false)return;
    if(ref.current)ref.current.rotation.y+=delta*.004;
    // lightning response: the cloud band brightens toward cool white and
    // settles back to its exact authored colour between strikes
    const m=matRef.current;
    if(m){
      if(!m.userData.base)m.userData.base=m.color.clone();
      m.color.copy(m.userData.base).lerp(SKY_FLASH,Math.min(1,stormState.env)*.7);
    }
  });
  return <mesh ref={ref} renderOrder={-1} frustumCulled={false}>
    <sphereGeometry args={[90,48,32]}/>
    {texture
      ?<meshBasicMaterial ref={matRef} map={texture} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false}/>
      :<meshBasicMaterial ref={matRef} color="#141b30" side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false}/>}
  </mesh>;
}

function Bat({start,scale=1,speed=1,phase=0}){
  const ref=useRef(),leftWing=useRef(),rightWing=useRef();
  const wing=useMemo(()=>{
    const s=new THREE.Shape();
    s.moveTo(.05,.12);s.lineTo(.2,.3);s.lineTo(.17,.07);s.lineTo(.42,.19);s.lineTo(.38,-.03);
    s.lineTo(.62,.04);s.quadraticCurveTo(.4,-.16,.05,-.11);s.closePath();
    return new THREE.ShapeGeometry(s,6);
  },[]);
  const body=useMemo(()=>new THREE.CircleGeometry(.1,12),[]);
  useEffect(()=>()=>{wing.dispose();body.dispose();},[wing,body]);
  useFrame(({clock})=>{
    if(typeof window!=='undefined'&&window.__MAFIAS_STATIC__!==false)return;
    if(!ref.current)return;
    const t=clock.elapsedTime*speed+phase;
    const flap=Math.sin(t*11);
    ref.current.position.x=start[0]+Math.sin(t*.75)*1.35;
    ref.current.position.y=start[1]+Math.sin(t*2.2)*.24;
    ref.current.position.z=start[2]+Math.cos(t*.6)*.4;
    ref.current.rotation.z=Math.sin(t*2.2)*.1;
    ref.current.rotation.y=Math.sin(t)*.16;
    if(rightWing.current)rightWing.current.rotation.z=flap*.55;
    if(leftWing.current)leftWing.current.rotation.z=-flap*.55;
  });
  return <group ref={ref} position={start} scale={scale}>
    <mesh ref={rightWing} geometry={wing}><meshBasicMaterial color="#04040a" side={THREE.DoubleSide} fog={false}/></mesh>
    <mesh ref={leftWing} geometry={wing} scale={[-1,1,1]}><meshBasicMaterial color="#04040a" side={THREE.DoubleSide} fog={false}/></mesh>
    <mesh geometry={body} scale={[.85,1.3,1]}><meshBasicMaterial color="#04040a" fog={false}/></mesh>
  </group>;
}

function Smoke(){
  const group=useRef();
  const items=useMemo(()=>Array.from({length:MOBILE?26:48},()=>({
    x:(Math.random()-.5)*18,y:-.05+Math.random()*1.2,z:-2-Math.random()*13,
    size:.55+Math.random()*1.7,phase:Math.random()*Math.PI*2,speed:.12+Math.random()*.24,opacity:.15+Math.random()*.24
  })),[]);
  const texture=useMemo(()=>{
    try{
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const ctx=canvas.getContext('2d');if(!ctx)return null;
      const g=ctx.createRadialGradient(64,64,2,64,64,62);
      g.addColorStop(0,'rgba(210,18,42,0.65)');g.addColorStop(.24,'rgba(160,12,34,0.34)');g.addColorStop(.58,'rgba(100,8,25,0.12)');g.addColorStop(1,'rgba(50,0,12,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
      return new THREE.CanvasTexture(canvas);
    }catch(e){return null;}
  },[]);
  useEffect(()=>()=>{texture?.dispose();},[texture]);
  useFrame(({clock,camera},delta)=>{
    if(typeof window!=='undefined'&&window.__MAFIAS_STATIC__!==false)return;
    if(!group.current)return;const t=clock.elapsedTime;
    group.current.children.forEach((sprite,i)=>{
      const d=items[i];if(!d)return;
      const cycle=(t*d.speed+d.phase)%2.6,u=cycle/2.6;
      sprite.position.y=d.y+cycle;
      sprite.position.x=d.x+Math.sin(t*.22+d.phase)*.55;
      // fade in as it rises, fade out at the top so the loop never pops
      const rise=Math.min(1,u*7),fall=Math.min(1,(1-u)*7);
      // fade out when the camera flies through it so it never washes the screen
      const dist=sprite.position.distanceTo(camera.position);
      const near=THREE.MathUtils.smoothstep(dist,1.6,5.5);
      sprite.material.rotation=Math.sin(t*.18+d.phase)*.25;
      sprite.material.opacity=d.opacity*(.7+.3*Math.sin(t*.6+d.phase))*rise*fall*near;
    });
  });
  return <group ref={group}>{items.map((d,i)=><sprite key={i} position={[d.x,d.y,d.z]} scale={[d.size*1.65,d.size,d.size]}><spriteMaterial map={texture} color="#cf203a" transparent opacity={d.opacity} depthWrite={false} blending={THREE.AdditiveBlending}/></sprite>)}</group>;
}

function Portal({refObj,lightA,lightB,materialRef}){return <group ref={refObj} name="mafias-portal" position={[0,2.2,PORTAL_Z0]}>
  <mesh><icosahedronGeometry args={[1.08,5]}/><MeshDistortMaterial ref={materialRef} color="#18060b" emissive="#520817" emissiveIntensity={1.45} metalness={.62} roughness={.5} distort={0} speed={0}/></mesh>
  <mesh scale={1.22}><icosahedronGeometry args={[1.08,2]}/><meshBasicMaterial color="#bd263d" wireframe transparent opacity={.14}/></mesh>
  <mesh rotation={[.4,.2,.1]}><torusGeometry args={[1.42,.012,8,100]}/><meshBasicMaterial color="#a81c32" transparent opacity={.6}/></mesh>
  {/* E. portal illumination: emissive surfaces + supplementary fill light */}
  <pointLight ref={lightA} color="#ff2742" intensity={30} distance={18} decay={2}/>
  <pointLight ref={lightB} position={[0,-1.75,.7]} color="#c11631" intensity={13} distance={12} decay={2}/>
</group>}

function GraveyardScene(){
  const {camera,scene,gl}=useThree();
  const portal=useRef();
  const scrollTarget=useRef(0),scrollCurrent=useRef(0),postEnter=useRef(false),enterZ=useRef(0),diving=useRef(false),reduced=useRef(false),started=useRef(false),reached=useRef(false);
  const portalLightA=useRef(null),portalLightB=useRef(null),portalMaterial=useRef(null);
  const stormApi=useRef(null);

  /* ---- shared assets: built once per quality preset, disposed on unmount ---- */
  const bendBark=useRef({uniforms:null});
  const bendGrass=useRef({uniforms:null});
  const A=useMemo(()=>{
    const treeGeos=makeTreeGeometries();
    const graveGeos=makeGraveGeometries();
    const moundGeo=makeMoundGeometry();
    const rockGeo=makeRockGeometry();
    const groundGeo=buildGroundGeometry(80,Q.groundSeg);
    const pathGeo=buildPathGeometry();
    const groundTex=makeGroundTextures(1024,7);
    const pathTex=makePathTexture(256,1024,19);
    const softTex=makeSoftTexture();
    const moonTex=makeMoonTexture();
    const barkTex=makeBarkTexture();
    const mats={
      bark:new THREE.MeshStandardMaterial({color:'#5c5044',roughness:.94,metalness:0,vertexColors:true,bumpMap:barkTex,bumpScale:.045}),
      stone:new THREE.MeshStandardMaterial({color:'#7e7b75',roughness:.86,metalness:0,vertexColors:true}),
      soil:new THREE.MeshStandardMaterial({color:'#443d36',roughness:.96,metalness:0,vertexColors:true}),
      ground:new THREE.MeshStandardMaterial({map:groundTex.color,roughnessMap:groundTex.rough,roughness:1,metalness:0,color:'#b8b1a5'}),
      path:new THREE.MeshStandardMaterial({map:pathTex,transparent:true,depthWrite:false,roughness:.95,metalness:0,color:'#b0a99d'})
    };
    // shared wind: bark bends in the vertex stage; grass blades use the same
    // WIND config through their own material (see GrassField.jsx)
    applyWindBend(mats.bark, bendBark.current, {ampU:WIND.branchAmp, heightY:5.5, baseY:1.5, weightExp:1.8});
    return {treeGeos,graveGeos,moundGeo,rockGeo,groundGeo,pathGeo,groundTex,pathTex,softTex,moonTex,barkTex,mats};
  },[]);
  useEffect(()=>()=>{
    A.treeGeos.forEach(g=>g.dispose());
    A.graveGeos.forEach(g=>g.dispose());
    [A.moundGeo,A.rockGeo,A.groundGeo,A.pathGeo].forEach(g=>g.dispose());
    [A.groundTex.color,A.groundTex.rough,A.pathTex,A.softTex,A.moonTex,A.barkTex].forEach(t=>t.dispose());
    Object.values(A.mats).forEach(m=>m.dispose());
    clearBendShaders();
  },[A]);

  /* ---------------------------------------------------------------- *
   * Placement — designed along the camera rail (z 12 → -6, |x| ≈ 0),
   * so the corridor stays clear while edges get framed.
   * ---------------------------------------------------------------- */
  const treeDefs=useMemo(()=>{
    const defs=[
      // entrance framing (visible in the opening composition)
      {v:5,x:-5.1,z:4.4,s:1.4,ry:.5},
      {v:0,x:5.6,z:3.2,s:1.5,ry:-.9,rz:-.05},
      {v:3,x:-4.8,z:8.2,s:1.25,ry:1.6},
      {v:1,x:5.2,z:7.4,s:1.35,ry:2.4},
      // mid graveyard
      {v:2,x:-6.2,z:-1.2,s:1.1,ry:.2},
      {v:4,x:6.3,z:-3,s:1.0,ry:2.9},
      {v:0,x:-7.6,z:-6.8,s:1.25,ry:1.1},
      {v:5,x:7.4,z:-9,s:1.15,ry:-.4,rz:-.04},
      {v:3,x:-4.9,z:-11,s:1.05,ry:.8},
      {v:1,x:4.7,z:-12.6,s:1.0,ry:2.1},
      // background silhouettes
      {v:2,x:-9.5,z:-14.5,s:1.3,ry:0},
      {v:4,x:9.8,z:-15.5,s:1.2,ry:1},
      {v:0,x:-6.5,z:-18,s:1.4,ry:2.5},
      {v:5,x:6.2,z:-19.5,s:1.3,ry:.4},
      {v:3,x:-12,z:-22,s:1.5,ry:1.8},
      {v:1,x:12.4,z:-23,s:1.45,ry:-.2},
      {v:2,x:0,z:-26,s:1.6,ry:2.2}
    ];
    return defs.slice(0,Q.trees).map(d=>({...d,y:groundBase(d.x,d.z)-.08}));
  },[]);

  const nearTree=useMemo(()=>{
    const trunks=treeDefs.map(d=>[d.x,d.z,1.1*d.s]);
    return (x,z)=>trunks.some(([tx,tz,r])=>Math.hypot(x-tx,z-tz)<1.7+r*.4);
  },[treeDefs]);

  const {graveGroups,moundData}=useMemo(()=>{
    const rng=makeRng(4242);
    const byV=[[],[],[],[],[],[]];
    const mounds=[];
    const fallen=[];
    const pickV=(z)=>{
      const r=rng();
      let v=r<.3?0:r<.52?1:r<.7?2:r<.86?3:4;
      if(z<-10&&rng()<.2)v=4;          // older broken markers toward the back
      if(rng()<.035)v=5;                // the occasional monument
      return v;
    };
    const place=(x,z,v,s,extra={})=>{
      const y=groundBase(x,z)-.04;
      const t=rng();
      const c=new THREE.Color();
      if(t<.24)c.setRGB(.74+rng()*.16,.84+rng()*.12,.7+rng()*.14); // mossy
      else{const g=.8+rng()*.38;c.setRGB(g,g*(.98+rng()*.05),g*(.94+rng()*.09));}
      byV[v].push({x,y,z,ry:extra.ry??(rng()-.5)*.5,rx:extra.rx??0,rz:extra.rz??0,s,color:c});
      if(extra.mound!==false&&rng()<.42){
        mounds.push({x,y:groundBase(x,z)-.13,z,ry:extra.ry??0,s:[s*(1+rng()*.5),s*(1+rng()*.3),s*(1.1+rng()*.5)]});
      }
    };
    // rows flanking the path
    for(let row=0;row<Q.graveRows;row++){
      const z=5.6-row*.92+(rng()-.5)*.3;
      for(const side of[-1,1]){
        if(rng()<.16)continue;
        const lane=row%3;
        const x=side*(2.2+lane*1.05+rng()*.55);
        if(nearTree(x,z)||Math.abs(x)<2.05)continue;
        const v=pickV(z);
        let s=(.8+rng()*.45)*(z<-9?.88:1);
        let rx=(rng()-.5)*.16,rz=(rng()-.5)*.22;
        if(v===4){rx*=2.4;rz*=2.4;s*=.9;}
        if(rng()<.09){rx+= (rng()-.5)*1.1;rz+=(rng()-.5)*1.1;s*=.85;} // toppled
        place(x,z,v,s,{rx,rz});
        // a smaller stone further out, kept clear of trees
        if(rng()<.32){
          const x2=side*(5.4+rng()*2.6),z2=z+(rng()-.5)*.7;
          if(!nearTree(x2,z2)&&Math.abs(x2)<13){
            place(x2,z2,pickV(z2),(.65+rng()*.35),{rx:(rng()-.5)*.3,rz:(rng()-.5)*.34});
          }
        }
      }
    }
    // back field
    for(let i=0;i<Q.backGraves*3&&byV.reduce((n,a)=>n+a.length,0)<Q.graveRows*2.6+Q.backGraves;i++){
      const x=(rng()-.5)*26,z=-9.5-rng()*8.5;
      if(Math.abs(x)<2.5||nearTree(x,z))continue;
      place(x,z,pickV(z),(.6+rng()*.4),{rx:(rng()-.5)*.3,rz:(rng()-.5)*.4});
    }
    // monuments: two flanking the entrance, two deeper in
    [[-3.1,5,1.15,.12],[3.3,6.2,1,-.15],[2.95,-6.6,.85,.2],[-3.3,-9.4,.9,-.3]].forEach(([x,z,s,ry])=>{
      if(nearTree(x,z))return;
      byV[5].push({x,y:groundBase(x,z)-.04,z,ry,s,color:new THREE.Color(.9+rng()*.2,.92+rng()*.16,.86+rng()*.14)});
    });
    // a few fallen slabs lying flat on the soil
    for(let i=0;i<5;i++){
      const x=(rng()-.5)*14,z=3-rng()*14;
      if(Math.abs(x)<2.4||nearTree(x,z))continue;
      fallen.push({x,y:groundBase(x,z)+.08,z,ry:rng()*Math.PI,rx:-1.32-rng()*.2,s:.8+rng()*.35,
        color:new THREE.Color(.72+rng()*.2,.78+rng()*.18,.66+rng()*.18)});
    }
    byV[3].push(...fallen);
    // bare mounds — empty graves with no surviving stone
    for(let i=0;i<(MOBILE?6:11);i++){
      const x=(rng()-.5)*13,z=4-rng()*17;
      if(Math.abs(x)<2.3||nearTree(x,z))continue;
      mounds.push({x,y:groundBase(x,z)-.13,z,ry:(rng()-.5)*.6,s:[.8+rng()*.7,.7+rng()*.4,1+rng()*.7]});
    }
    return {graveGroups:byV,moundData:mounds};
  },[Q,nearTree]);

  const rockData=useMemo(()=>{
    const rng=makeRng(211),out=[];
    let guard=0;
    while(out.length<Q.rocks&&guard++<Q.rocks*8){
      const x=(rng()-.5)*30,z=9-rng()*31;
      if(Math.abs(x)<1.05&&rng()<.8)continue;
      out.push({x,y:groundBase(x,z)+.02,z,rx:rng()*3,ry:rng()*3,rz:rng()*3,s:.4+rng()*1.5,
        color:new THREE.Color().setRGB(.7+rng()*.5,.7+rng()*.45,.68+rng()*.45)});
    }
    return out;
  },[Q]);

  /* Grass lives in patches — around tree bases, between the graves, along the
     graveyard edges, near broken stonework and thinly on the path margins —
     with a hard mask keeping the camera rail, the trunks and every stone clear. */
  const grassField=useMemo(()=>{
    const rng=makeRng(101);
    const patches=[],blocks=[];
    // tufts hugging every tree base
    treeDefs.forEach(d=>{
      patches.push({x:d.x,z:d.z,r:1.5+1.1*d.s,w:2.4,s:1.05});
      blocks.push({x:d.x,z:d.z,r:.62*d.s+.34});
    });
    // between the tombstones
    graveGroups.flat().forEach(g=>{
      blocks.push({x:g.x,z:g.z,r:.4+.42*(g.s??1)});
      if(rng()<.85)patches.push({x:g.x+(rng()-.5)*1.7,z:g.z+(rng()-.5)*1.7,r:1.35,w:1.5,s:.85+rng()*.45});
    });
    // bare mounds: nothing grows through a fresh grave
    moundData.forEach(m=>blocks.push({x:m.x,z:m.z,r:.62}));
    // broad, low-density blankets over the cemetery floor (still masked per stone)
    for(let i=0;i<14;i++){
      const side=i%2?-1:1;
      patches.push({x:side*(2.9+rng()*5.5),z:7-rng()*20,r:2.6+rng()*1.8,w:1.1,s:.8+rng()*.5});
    }
    // graveyard edges
    for(let i=0;i<12;i++){
      const side=i%2?-1:1;
      patches.push({x:side*(7+rng()*5.5),z:8-rng()*25,r:2.2+rng()*2.2,w:1.5,s:.85+rng()*.5});
    }
    // near broken stonework and loose rocks
    rockData.forEach((r,i)=>{if(i%4===0)patches.push({x:r.x,z:r.z,r:.85,w:.7,s:.8});});
    // sparse tufts along the path margins
    for(let i=0;i<10;i++){
      const side=i%2?-1:1;
      patches.push({x:side*(2+rng()*.9),z:9-rng()*20,r:1.2,w:.7,s:.7+rng()*.3});
    }
    // back field
    for(let i=0;i<6;i++)patches.push({x:(rng()-.5)*22,z:-13-rng()*6,r:2.6+rng()*2,w:1.3,s:.9+rng()*.4});

    const exclude=(x,z)=>{
      if(Math.abs(x)<1.75)return true;                 // whole width of the path
      if(Math.abs(x)>14.5||z>9.5||z<-20)return true;   // outside the graveyard
      for(let i=0;i<blocks.length;i++){
        const b=blocks[i],dx=x-b.x,dz=z-b.z;
        if(dx*dx+dz*dz<b.r*b.r)return true;            // trunks, stones, mounds
      }
      return false;
    };
    return {patches,exclude,count:Q.blades};
  },[treeDefs,graveGroups,moundData,rockData,Q]);

  const treeGroups=useMemo(()=>{
    const byV={};
    treeDefs.forEach(d=>{
      (byV[d.v]=byV[d.v]||[]).push(d);
    });
    return Object.entries(byV).map(([v,data])=>({geometry:A.treeGeos[+v],data}));
  },[treeDefs,A]);

  const bats=useMemo(()=>Array.from({length:MOBILE?10:16},()=>({
    start:[(Math.random()-.5)*13,3.2+Math.random()*4,-10.5-Math.random()*8],
    scale:.22+Math.random()*.3,speed:.65+Math.random()*.9,phase:Math.random()*6
  })),[]);

  useEffect(()=>{
    reduced.current=prefersReduced();
    scene.fog=new THREE.FogExp2(FOG_COLOR,FOG_DENSITY);
    /* The graveyard now lives from the first frame: bats, wind, ghosts and
       the drifting smoke are the ambient layer the visitor asked for — only
       the intro sequence is event-driven on top of them. */
    window.__MAFIAS_STATIC__=false;
    const freezeAudio=()=>{window.__MAFIAS_AUDIO_STOPPED__=true;};
    window.addEventListener('mafias:stop-audio',freezeAudio);
    if(import.meta.env.DEV){
      // dev-only inspection hook used by the browser audit
      window.__MAFIAS__={camera,scene,renderer:gl,get progress(){return scrollCurrent.current;},get target(){return scrollTarget.current;},get storm(){return stormApi.current;}};
    }
    /* Phase B — leave the idle pose and push a short way toward the orb.
       The entrance timeline decides *when*; the easing stays here. */
    const enter=(event)=>{
      started.current=true;
      window.__MAFIAS_STATIC__=false;
      diving.current=true;
      const duration=event?.detail?.duration??.36;
      /* The push always ends the same distance short of the orb: from the
         idle pose that is the classic 12 → 8.3 move, from the end of the
         scroll approach it is only the last step forward. */
      const orbZ=portal.current?portal.current.position.z:PORTAL_Z0;
      const pushZ=Math.max(orbZ+3.2,camera.position.z-3.7);
      /* Hand the smoke field the orb's world position: it anchors itself
         on the camera → orb ray when it mounts at 0.45 s. */
      introSmoke.anchor={x:0,y:2.2,z:orbZ};
      gsap.killTweensOf(camera.position);
      gsap.to(camera.position,{x:0,y:2.2,z:pushZ,duration,ease:'power2.inOut'});
      if(portal.current){
        gsap.killTweensOf(portal.current.scale);
        gsap.to(portal.current.scale,{x:1.2,y:1.2,z:1.2,duration,ease:'power2.out'});
      }
    };
    /* Phase C — the orb flares and settles back to its authored brightness,
       so the red flash reads as the portal opening, not a UI overlay. */
    const portalPulse=()=>{
      if(!diving.current)return;
      const mat=portalMaterial.current;
      if(mat)gsap.timeline()
        .to(mat,{emissiveIntensity:4.4,duration:.08,ease:'power2.in'})
        .to(mat,{emissiveIntensity:1.45,duration:.34,ease:'power2.out'});
      if(portalLightA.current)gsap.timeline()
        .to(portalLightA.current,{intensity:86,duration:.08,ease:'power2.in'})
        .to(portalLightA.current,{intensity:30,duration:.4,ease:'power2.out'});
      if(portalLightB.current)gsap.timeline()
        .to(portalLightB.current,{intensity:38,duration:.08,ease:'power2.in'})
        .to(portalLightB.current,{intensity:13,duration:.4,ease:'power2.out'});
    };
    // the smoke has covered the frame: hide the orb geometry itself so the
    // cover is total (on the scroll-arrival path the orb sits nearer the
    // lens than the smoke wall and would otherwise read through it)
    const veil=()=>{if(portal.current)portal.current.visible=false;};
    // hand camera control back to the scrollbar without a jump
    const entered=()=>{
      diving.current=false;
      postEnter.current=true;
      enterZ.current=camera.position.z;
      gsap.killTweensOf(camera.position);
      if(portal.current)portal.current.visible=true;   // the graveyard is back
    };
    const onScroll=(event)=>{scrollTarget.current=event.detail?.progress ?? 0;};
    window.addEventListener('mafias:enter',enter);
    window.addEventListener('mafias:portal-pulse',portalPulse);
    window.addEventListener('mafias:portal-veil',veil);
    window.addEventListener('mafias:entered',entered);
    window.addEventListener('mafias:scroll',onScroll);
    return()=>{
      window.removeEventListener('mafias:stop-audio',freezeAudio);
      window.removeEventListener('mafias:enter',enter);
      window.removeEventListener('mafias:portal-pulse',portalPulse);
      window.removeEventListener('mafias:portal-veil',veil);
      window.removeEventListener('mafias:entered',entered);
      window.removeEventListener('mafias:scroll',onScroll);
      gsap.killTweensOf(camera.position);
      if(portal.current)gsap.killTweensOf(portal.current.scale);
      scene.fog=null;
      window.__MAFIAS_STATIC__=undefined;
      if(import.meta.env.DEV&&window.__MAFIAS__)delete window.__MAFIAS__;
    };
  },[camera,scene,gl]);

  useFrame(({pointer,clock},delta)=>{
    const t=clock.elapsedTime;
    updateWind(t); // shared time source: bark + grass bend shaders
    scrollCurrent.current=THREE.MathUtils.damp(scrollCurrent.current,scrollTarget.current,3.2,delta);
    const p=scrollCurrent.current;

    /* During the push GSAP owns the camera position — we only keep it
       aimed at wherever the orb actually is (it travels with scroll). */
    if(diving.current){camera.lookAt(0,2.1,portal.current?portal.current.position.z:PORTAL_Z0);return;}

    const px=reduced.current?0:pointer.x,py=reduced.current?0:pointer.y;

    if(!started.current){
      /* --- idle + approach ----------------------------------------- *
         A continuous slow sway (left, then right, forever) that eases out
         as the scroll carries the camera toward the orb. The orb itself
         holds still — the camera does all of the travelling. */
      const a=Math.min(1,p/APPROACH_P);
      const calm=1-a*.65;
      const swayX=reduced.current?0:Math.sin(t*SWAY_SPEED)*SWAY_X*calm;
      const swayY=reduced.current?0:Math.sin(t*SWAY_SPEED*.72+1.3)*SWAY_Y*calm;
      camera.position.x=THREE.MathUtils.damp(camera.position.x,swayX+px*.35,1.7,delta);
      camera.position.y=THREE.MathUtils.damp(camera.position.y,2.7+swayY+py*.14,2,delta);
      camera.position.z=THREE.MathUtils.damp(camera.position.z,CAM_START+(APPROACH_Z-CAM_START)*a,3.2,delta);
      camera.lookAt(0,LOOK_Y0+a*.55,PORTAL_Z0+p*PORTAL_Z_TRAVEL);
      if(portal.current){
        portal.current.rotation.y+=delta*.11;
        // the orb keeps its authored scroll travel — freezing it here and
        // releasing it after the intro would make it jump backwards at settle
        portal.current.position.z=PORTAL_Z0+p*PORTAL_Z_TRAVEL;
      }
      /* the orb reads hotter as the visitor closes in; Phase C still owns
         emissiveIntensity, so only the fill light is driven here */
      if(portalLightA.current)portalLightA.current.intensity=30+a*34;
      if(!reached.current&&a>=1){
        reached.current=true;
        window.dispatchEvent(new CustomEvent('mafias:enter-auto'));
      }
      return;
    }

    /* --- after the sequence: the scrollbar owns the camera again --- */
    camera.position.x+=(px*.25-camera.position.x*.012)*delta;
    camera.position.y=THREE.MathUtils.damp(camera.position.y,2.7+py*.14+p*1.15,2.2,delta);
    camera.position.z=THREE.MathUtils.damp(camera.position.z,postEnter.current?enterZ.current+POST_ENTER_TRAVEL*p:CAM_START+CAM_TRAVEL*p,3.2,delta);
    camera.lookAt(0,LOOK_Y0+p*LOOK_Y1,LOOK_Z0+p*LOOK_Z1);
    if(portal.current){portal.current.rotation.y+=delta*.11;portal.current.position.z=PORTAL_Z0+p*PORTAL_Z_TRAVEL;}
  });

  return <>
    <color attach="background" args={['#12151e']}/>
    <Sky/>
    <SceneLights/>
    {/* F. exposure stays at the renderer default (ACES, 1.0): contrast comes
        from light placement, not from lifting the whole frame. */}

    {/* G. terrain: displaced soil with texture variation + a trodden path */}
    <mesh geometry={A.groundGeo} receiveShadow material={A.mats.ground}/>
    <mesh geometry={A.pathGeo} receiveShadow material={A.mats.path}/>

    {/* G. ground clutter */}
    <Instances geometry={A.rockGeo} material={A.mats.soil} data={rockData} colors receiveShadow/>

    {/* Phase 3–4: instanced grass blades (ZIP shader, shared wind config) */}
    <GrassField patches={grassField.patches} exclude={grassField.exclude} count={grassField.count} seed={101}/>

    {/* Phase 2–4: instanced dead trees + graveyard stonework */}
    {treeGroups.map((g,i)=><Instances key={`t${i}`} geometry={g.geometry} material={A.mats.bark} data={g.data} castShadow receiveShadow/>)}
    {graveGroups.map((data,i)=>data.length>0&&
      <Instances key={`g${i}`} geometry={A.graveGeos[i]} material={A.mats.stone} data={data} castShadow receiveShadow colors/>)}
    <Instances geometry={A.moundGeo} material={A.mats.soil} data={moundData} receiveShadow colors/>

    <Ghosts treeGeos={A.treeGeos} treeDefs={treeDefs}/>
    <Moon soft={A.softTex} moonTex={A.moonTex}/>
    <Haze soft={A.softTex}/>
    <Portal refObj={portal} lightA={portalLightA} lightB={portalLightB} materialRef={portalMaterial}/>
    <SkullStatue />
    <Storm apiRef={stormApi} soft={A.softTex}/>
    {/* volumetric storm clouds: one EffectComposer, driven by stormState */}
    <CloudSky/>
    <Smoke/>
    {bats.map((b,i)=><Bat key={i} {...b}/>)}
    <Sparkles count={Q.sparks} scale={[15,7,16]} size={1.4} speed={.13} opacity={.24} color="#c32a42" position={[0,1.5,-5]}/>
    {/* entrance only — mounts on the smoke-burst label, unmounts when the
        sequence settles (see ../scene/introSmoke.js) */}
    <IntroSmoke/>
  </>;
}

/* The scene takes no props, so memo keeps scroll-driven App renders from
   re-rendering (and re-reconciling) the whole graveyard tree. */
export default memo(GraveyardScene);
