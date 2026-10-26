import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Deterministic randomness — every asset is seeded so the scene is
 * identical between reloads and between StrictMode double-mounts.
 * ------------------------------------------------------------------ */
export function makeRng(seed){
  let a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

function hash2(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);}
function hash3(x,y,z){const s=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453;return s-Math.floor(s);}
function sm(t){return t*t*(3-2*t);}

export function noise2(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=sm(xf),v=sm(yf);
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);
  return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
}
export function fbm2(x,y){
  return noise2(x,y)*.55+noise2(x*2.13+5.2,y*2.13-1.7)*.3+noise2(x*4.31-3.1,y*4.31+8.4)*.15;
}

/* ------------------------------------------------------------------ *
 * Terrain — a single shared height function used by the ground mesh,
 * the path mesh and every object placement, so nothing floats.
 * ------------------------------------------------------------------ */
export function groundBase(x,z){
  const roll=Math.sin(x*.21+1.3)*Math.cos(z*.17-.7)*.06+Math.sin(x*.53+z*.39)*.035;
  // keep the central path corridor nearly flat so graves/stones sit cleanly
  const flat=.15+.85*THREE.MathUtils.clamp((Math.abs(x)-1.1)/1.6,0,1);
  return -.37+roll*flat;
}
export function groundSurface(x,z){
  return groundBase(x,z)+(fbm2(x*1.31,z*1.31)-.5)*.05;
}

export function buildGroundGeometry(size=80,seg=96){
  const g=new THREE.PlaneGeometry(size,size,seg,seg);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,groundSurface(p.getX(i),p.getZ(i)));
  p.needsUpdate=true;
  g.computeVertexNormals();
  return g;
}

export function buildPathGeometry(width=3.6,len=30,cz=-6){
  const g=new THREE.PlaneGeometry(width,len,10,56);
  g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i)+cz;
    p.setXYZ(i,x,groundSurface(x,z)+.016,z);
  }
  p.needsUpdate=true;
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ *
 * Dead trees — frame-transported tapered tubes, recursively branched,
 * merged into ONE BufferGeometry per silhouette (then instanced).
 * ------------------------------------------------------------------ */
export function buildTree(seed,opt={}){
  const rng=makeRng(seed*2654435761>>>0);
  const P=[],I=[],U=[];
  const cfg={
    height:opt.height??6,
    trunkR:opt.trunkR??.3,
    primaries:opt.primaries??(3+Math.floor(rng()*3)),
    maxDepth:opt.maxDepth??2,
    spread:opt.spread??.6,
    lean:opt.lean??.15,
    upTrunk:opt.upTrunk??.55,
    broken:opt.broken??.2,
    radial:opt.radial??6,
    warmth:opt.warmth??.6
  };

  function grow(o,d,len,r0,depth){
    if(P.length/3>7000)return;
    const radial=depth===0?cfg.radial:depth===1?Math.max(5,cfg.radial-1):4;
    const rings=depth===0?9:depth===1?6:4;
    const terminal=depth>cfg.maxDepth;
    const broken=!terminal&&rng()<cfg.broken*(depth?1.5:.5);
    const rEnd=terminal?.006:(broken?r0*.5:r0*(.42+rng()*.18));
    const upTarget=depth===0?cfg.upTrunk:depth===1?.45:.34;

    // walk the spine with a parallel-transported frame
    let p=o.clone(),t=d.clone().normalize();
    let n=new THREE.Vector3(0,1,0);
    if(Math.abs(t.y)>.92)n.set(1,0,0);
    n.crossVectors(n,t).normalize();
    const sC=[],sT=[],sN=[],sB=[],sR=[];
    const bendTotal=(rng()-.5)*(depth===0?.9:1.35);
    const bendAxis=new THREE.Vector3().crossVectors(t,Math.abs(t.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize();
    const wander=new THREE.Vector3();

    const start=P.length/3;
    for(let i=0;i<=rings;i++){
      const tt=i/rings;
      const r=r0+(rEnd-r0)*Math.pow(tt,.85);
      sC.push(p.clone());sT.push(t.clone());sN.push(n.clone());sR.push(r);
      const b=new THREE.Vector3().crossVectors(t,n);sB.push(b.clone());
      const flare=depth===0?1+.85*Math.max(0,1-i/1.6):1;
      const base=P.length/3;
      for(let j=0;j<radial;j++){
        const a=j/radial*Math.PI*2+i*.17;
        const wob=1+.11*Math.sin(a*3+i*1.1+seed)+.06*Math.sin(a*5-i*.7);
        const rr=r*flare*wob,cs=Math.cos(a),sn=Math.sin(a);
        P.push(
          p.x+(cs*n.x+sn*b.x)*rr,
          p.y+(cs*n.y+sn*b.y)*rr,
          p.z+(cs*n.z+sn*b.z)*rr
        );
        U.push(j/radial,tt*len*.4);
      }
      if(i<rings){
        for(let j=0;j<radial;j++){
          const j2=(j+1)%radial;
          I.push(base+j,base+j2,base+radial+j, base+j2,base+radial+j2,base+radial+j);
        }
        // advance along the spine
        t.applyAxisAngle(bendAxis,bendTotal/rings);
        wander.crossVectors(t,bendAxis).normalize();
        t.applyAxisAngle(wander,(rng()-.5)*.07);
        t.y+=(upTarget-t.y)*.12;
        t.normalize();
        n.addScaledVector(t,-n.dot(t));
        if(n.lengthSq()<1e-6)n.set(1,0,0);
        n.normalize();
        p.addScaledVector(t,len/rings);
      }
    }

    // cap the tip (jagged when the branch is broken off)
    const last=start+rings*radial;
    const cap=P.length/3;
    const off=broken?.35*rEnd:.6*rEnd;
    P.push(
      p.x+t.x*off+(broken?(rng()-.5)*rEnd*.8:0),
      p.y+t.y*off+(broken?rEnd*.3:0),
      p.z+t.z*off+(broken?(rng()-.5)*rEnd*.8:0)
    );
    U.push(.5,1);
    for(let j=0;j<radial;j++)I.push(cap,last+j,last+(j+1)%radial);

    // children
    if(!broken&&!terminal&&P.length/3<6800){
      const nKids=depth===0?cfg.primaries:depth===1?(rng()<.7?2:3):(rng()<.5?2:1);
      const t0=depth===0?.3:.34,span=depth===0?.62:.6;
      const used=[];
      for(let k=0;k<nKids;k++){
        const frac=t0+(k+.2+rng()*.6)/nKids*span;
        let idx=Math.min(rings,Math.max(1,Math.round(frac*rings)));
        if(used.some(u=>Math.abs(u-idx)<1))idx=Math.min(rings,idx+1);
        used.push(idx);
        const phi=rng()*Math.PI*2;
        const axis=sN[idx].clone().multiplyScalar(Math.cos(phi)).addScaledVector(sB[idx],Math.sin(phi)).normalize();
        const ang=cfg.spread*(.7+rng()*.75);
        const cd=sT[idx].clone().applyAxisAngle(axis,ang);
        cd.y+=(depth===0?.28:.16)+(rng()-.5)*.3;
        cd.normalize();
        grow(
          sC[idx].clone().addScaledVector(cd,-sR[idx]*.3),
          cd,len*(.42+rng()*.22),sR[idx]*.78,depth+1
        );
      }
    }
  }

  const dir=new THREE.Vector3((rng()-.5)*cfg.lean*2,1,(rng()-.5)*cfg.lean*2).normalize();
  grow(new THREE.Vector3(0,0,0),dir,cfg.height,cfg.trunkR,0);

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
  g.setIndex(I);
  g.computeVertexNormals();
  bakeColors(g,{seed,warmth:cfg.warmth,mossy:false,bark:true,height:cfg.height});
  g.computeBoundingSphere();
  return g;
}

/* Vertex-colour weathering: mottling, sky-facing lightening, base AO,
 * optional moss. Runs after normals so it can use them. */
function bakeColors(g,{seed=1,warmth=.5,mossy=false,bark=false,height=3}={}){
  const pos=g.attributes.position,nor=g.attributes.normal;
  const col=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const ny=nor?nor.getY(i):0;
    const n=fbm2(x*2.7+seed*.13,y*1.9+seed*.7,z*2.4-seed*.4);
    let v=bark?.7+.5*n:.72+.42*n;
    v*=bark?.84+.3*Math.max(0,ny):.9+.16*Math.max(0,ny);
    if(bark)v*=THREE.MathUtils.clamp(.6+y*(.4/height),.6,1.04);
    else v*=.94+.1*Math.max(0,y);
    v=THREE.MathUtils.clamp(v,.34,1.42);
    let r=v*(1+.09*warmth),gg=v*(1+.015*warmth),b=v*(1-.07*warmth);
    if(mossy){
      const m=THREE.MathUtils.clamp((.32-y)*1.5,0,1)*THREE.MathUtils.clamp((n-.44)*3.2,0,1)*.85;
      r*=1-.36*m;gg*=1+.06*m;b*=1-.3*m;
    }
    col[i*3]=r;col[i*3+1]=gg;col[i*3+2]=b;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
}

export function makeTreeGeometries(){
  return [
    {seed:11,height:7.4,trunkR:.35,primaries:4,lean:.14,broken:.24,spread:.62,warmth:.7,radial:7},
    {seed:23,height:6.2,trunkR:.30,primaries:3,lean:.30,broken:.32,spread:.5,warmth:.4},
    {seed:37,height:5.4,trunkR:.26,primaries:5,lean:.06,broken:.16,spread:.78,warmth:.85},
    {seed:52,height:6.9,trunkR:.33,primaries:4,lean:.34,broken:.36,spread:.55,warmth:.3},
    {seed:68,height:4.5,trunkR:.22,primaries:3,lean:.22,broken:.42,spread:.82,warmth:.6},
    {seed:81,height:8.2,trunkR:.38,primaries:5,lean:.09,broken:.2,spread:.6,warmth:.5,radial:7}
  ].map(v=>buildTree(v.seed,v));
}

/* ------------------------------------------------------------------ *
 * Graveyard stonework — shape variants, chipped edges, discoloration.
 * ------------------------------------------------------------------ */
function weather(g,amp=.02){
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const h1=hash3(x,y,z),h2=hash3(y+.7,z,x+.3),h3=hash3(z+1.1,x,y+.5);
    p.setXYZ(i,x+(h1-.5)*2*amp,y+(h2-.5)*2*amp*.8,z+(h3-.5)*2*amp);
  }
  p.needsUpdate=true;
  g.computeVertexNormals();
}

function centerStone(g){
  g.computeBoundingBox();
  const bb=g.boundingBox;
  g.translate(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2);
}

function extrudedStone(makeShape,{depth=.17,bevel=.035,seed=1,amp=.02,warmth=.4}={}){
  const g=new THREE.ExtrudeGeometry(makeShape(),{
    depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:8
  });
  weather(g,amp);
  centerStone(g);
  bakeColors(g,{seed,warmth,mossy:true});
  return g;
}

function mergeGeos(list){
  const parts=list.map(g=>g.index?g.toNonIndexed():g);
  let total=0;for(const g of parts)total+=g.attributes.position.count;
  const pos=new Float32Array(total*3),nor=new Float32Array(total*3);
  let o=0;
  for(const g of parts){
    pos.set(g.attributes.position.array,o*3);
    nor.set(g.attributes.normal.array,o*3);
    o+=g.attributes.position.count;
    g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  return out;
}

const roundShape=()=>{
  const s=new THREE.Shape();
  s.moveTo(-.4,0);s.lineTo(.4,0);s.lineTo(.4,.55);
  s.quadraticCurveTo(.4,.99,0,.99);
  s.quadraticCurveTo(-.4,.99,-.4,.55);
  s.closePath();return s;
};
const tallShape=()=>{
  const s=new THREE.Shape();
  s.moveTo(-.33,0);s.lineTo(.33,0);s.lineTo(.33,.84);
  s.quadraticCurveTo(.33,1.04,.15,1.16);
  s.lineTo(0,1.27);s.lineTo(-.15,1.16);
  s.quadraticCurveTo(-.33,1.04,-.33,.84);
  s.closePath();return s;
};
const crossShape=()=>{
  const b=.085,ax=.37;
  const s=new THREE.Shape();
  const pts=[[-b,0],[b,0],[b,.6],[ax,.6],[ax,.82],[b,.82],[b,1.14],[-b,1.14],[-b,.82],[-ax,.82],[-ax,.6],[-b,.6]];
  s.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)s.lineTo(pts[i][0],pts[i][1]);
  s.closePath();return s;
};
const slabShape=()=>{
  const s=new THREE.Shape();
  s.moveTo(-.46,0);s.lineTo(.46,0);s.lineTo(.45,.28);
  s.lineTo(.3,.43);s.lineTo(.05,.39);s.lineTo(-.18,.5);s.lineTo(-.43,.41);
  s.closePath();return s;
};
const stumpShape=()=>{
  const s=new THREE.Shape();
  s.moveTo(-.38,0);s.lineTo(.38,0);s.lineTo(.38,.28);
  s.lineTo(.3,.45);s.lineTo(.12,.37);s.lineTo(-.1,.53);s.lineTo(-.3,.41);s.lineTo(-.38,.3);
  s.closePath();return s;
};

function obeliskGeo(seed){
  const box=(w,h,d,y)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(0,y,0);return g;};
  const shaft=new THREE.CylinderGeometry(.13,.22,1.5,4,1);
  shaft.rotateY(Math.PI/4);shaft.translate(0,1.21,0);
  const cap=new THREE.ConeGeometry(.132,.34,4,1);
  cap.rotateY(Math.PI/4);cap.translate(0,2.13,0);
  const g=mergeGeos([box(.76,.26,.62,.13),box(.58,.2,.46,.36),shaft,cap]);
  g.computeVertexNormals();
  weather(g,.016);
  centerStone(g);
  bakeColors(g,{seed,warmth:.5,mossy:true});
  return g;
}

export function makeGraveGeometries(){
  return [
    extrudedStone(roundShape,{depth:.17,seed:3,amp:.018,warmth:.35}),
    extrudedStone(tallShape,{depth:.15,seed:7,amp:.016,warmth:.55}),
    extrudedStone(crossShape,{depth:.14,seed:11,amp:.014,warmth:.45}),
    extrudedStone(slabShape,{depth:.2,seed:13,amp:.024,warmth:.3}),
    extrudedStone(stumpShape,{depth:.16,seed:17,amp:.03,warmth:.6}),
    obeliskGeo(23)
  ];
}

export function makeMoundGeometry(){
  const g=new THREE.SphereGeometry(.62,16,10);
  g.scale(1,.42,1.35);
  weather(g,.045);
  bakeColors(g,{seed:31,warmth:.7,mossy:false});
  return g;
}

export function makeRockGeometry(){
  const g=new THREE.IcosahedronGeometry(.1,0);
  weather(g,.03);
  bakeColors(g,{seed:41,warmth:.5,mossy:true});
  return g;
}

/* Two crossed quads — cheap instanced dead-grass tufts. */
export function makeGrassGeometry(){
  const pos=[],uv=[],idx=[];
  const push=(nx)=>{
    const b=pos.length/3;
    const h=.72;
    if(nx){pos.push(0,0,-.5, 0,0,.5, 0,h,.5, 0,h,-.5);}
    else{pos.push(-.5,0,0, .5,0,0, .5,h,0, -.5,h,0);}
    uv.push(0,0,1,0,1,1,0,1);
    idx.push(b,b+1,b+2,b,b+2,b+3);
  };
  push(false);push(true);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ *
 * Canvas textures (all deterministic, all built once at startup).
 * ------------------------------------------------------------------ */
function texFromCanvas(c,repeat=0){
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(repeat)t.repeat.set(repeat,repeat);
  t.anisotropy=4;
  return t;
}

/* Wrapped blit so patches never show a seam at the repeat edge. */
function wrapped(ctx,w,h,x,y,r,draw){
  if(x>r&&x<w-r&&y>r&&y<h-r){draw(ctx,x,y);return;}
  for(const dx of[-w,0,w])for(const dy of[-h,0,h])draw(ctx,x+dx,y+dy);
}

export function makeGroundTextures(size=1024,seed=7){
  const rng=makeRng(seed);
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#3a352e';ctx.fillRect(0,0,size,size);
  // broad soil colour drift
  for(let i=0;i<70;i++){
    const x=rng()*size,y=rng()*size,r=40+rng()*150;
    const dark=rng()<.6;
    const col=dark?`rgba(26,22,19,${.16+rng()*.2})`:`rgba(84,76,64,${.1+rng()*.14})`;
    wrapped(ctx,size,size,x,y,r,(cc,px,py)=>{
      const g=cc.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
      cc.fillStyle=g;cc.beginPath();cc.arc(px,py,r,0,Math.PI*2);cc.fill();
    });
  }
  // moss / lichen patches
  for(let i=0;i<44;i++){
    const x=rng()*size,y=rng()*size,r=22+rng()*70;
    wrapped(ctx,size,size,x,y,r,(cc,px,py)=>{
      const g=cc.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,`rgba(58,70,46,${.1+rng()*.12})`);g.addColorStop(1,'rgba(0,0,0,0)');
      cc.fillStyle=g;cc.beginPath();cc.arc(px,py,r,0,Math.PI*2);cc.fill();
    });
  }
  // mid speckle
  for(let i=0;i<380;i++){
    const x=rng()*size,y=rng()*size,r=5+rng()*16;
    const dark=rng()<.55;
    wrapped(ctx,size,size,x,y,r,(cc,px,py)=>{
      const g=cc.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,dark?`rgba(20,17,15,${.2+rng()*.22})`:`rgba(96,88,72,${.12+rng()*.16})`);
      g.addColorStop(1,'rgba(0,0,0,0)');
      cc.fillStyle=g;cc.beginPath();cc.arc(px,py,r,0,Math.PI*2);cc.fill();
    });
  }
  // pebbles
  for(let i=0;i<520;i++){
    const x=rng()*size,y=rng()*size,r=1+rng()*3.2;
    ctx.globalAlpha=.2+rng()*.45;
    ctx.fillStyle=rng()<.5?'#7d7469':'#191613';
    ctx.beginPath();ctx.ellipse(x,y,r,r*(.6+rng()*.7),rng()*3,0,Math.PI*2);ctx.fill();
  }
  // dead grass flecks
  ctx.lineCap='round';
  for(let i=0;i<420;i++){
    const x=rng()*size,y=rng()*size,a=rng()*Math.PI*2,l=4+rng()*13;
    ctx.globalAlpha=.14+rng()*.3;
    ctx.strokeStyle=rng()<.6?'#6e6744':'#4b4634';
    ctx.lineWidth=.8+rng()*1.4;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();
  }
  ctx.globalAlpha=1;

  // roughness: mostly dry soil, a few selective wet patches (never metallic)
  const rc=document.createElement('canvas');rc.width=rc.height=512;
  const rx=rc.getContext('2d');
  rx.fillStyle='#e8e8e8';rx.fillRect(0,0,512,512);
  for(let i=0;i<18;i++){
    const x=rng()*512,y=rng()*512,r=26+rng()*90;
    wrapped(rx,512,512,x,y,r,(cc,px,py)=>{
      const g=cc.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,'rgba(184,184,184,.7)');g.addColorStop(1,'rgba(184,184,184,0)');
      cc.fillStyle=g;cc.beginPath();cc.arc(px,py,r,0,Math.PI*2);cc.fill();
    });
  }
  const color=texFromCanvas(c,8);
  const rough=new THREE.CanvasTexture(rc);
  rough.wrapS=rough.wrapT=THREE.RepeatWrapping;rough.repeat.set(8,8);
  return {color,rough};
}

export function makePathTexture(w=256,h=1024,seed=19){
  const rng=makeRng(seed);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  // feathered opaque core
  const g=ctx.createLinearGradient(0,0,w,0);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(.16,'rgba(0,0,0,1)');
  g.addColorStop(.5,'rgba(0,0,0,1)');
  g.addColorStop(.84,'rgba(0,0,0,1)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle='#6a6053';ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='destination-in';
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.globalCompositeOperation='source-over';
  // ruts + trodden variation
  for(const cx of[.3,.7]){
    const rg=ctx.createLinearGradient(w*(cx-.14),0,w*(cx+.14),0);
    rg.addColorStop(0,'rgba(52,46,39,0)');
    rg.addColorStop(.5,'rgba(52,46,39,.5)');
    rg.addColorStop(1,'rgba(52,46,39,0)');
    ctx.fillStyle=rg;ctx.fillRect(w*(cx-.14),0,w*.28,h);
  }
  for(let i=0;i<260;i++){
    const x=rng()*w,y=rng()*h,r=6+rng()*40;
    const dark=rng()<.62;
    const gg=ctx.createRadialGradient(x,y,0,x,y,r);
    gg.addColorStop(0,dark?`rgba(30,26,22,${.14+rng()*.2})`:`rgba(126,116,98,${.1+rng()*.14})`);
    gg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gg;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<420;i++){
    const x=rng()*w,y=rng()*h,r=1+rng()*3;
    ctx.globalAlpha=.16+rng()*.4;
    ctx.fillStyle=rng()<.5?'#8d8477':'#241f1a';
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}

export function makeGrassTexture(size=128,seed=29){
  const rng=makeRng(seed);
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,size,size);
  ctx.lineCap='round';
  for(let i=0;i<26;i++){
    const x0=6+rng()*(size-12);
    const h=size*(.45+rng()*.5);
    const lean=(rng()-.5)*46;
    const w=2.2+rng()*2.6;
    ctx.strokeStyle=rng()<.45?'#8a8152':rng()<.6?'#6d6742':'#565238';
    ctx.lineWidth=w;
    ctx.beginPath();
    ctx.moveTo(x0,size);
    ctx.quadraticCurveTo(x0+lean*.35,size-h*.55,x0+lean,size-h);
    ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

/* soft radial falloff — reused by red haze billboards and the moon glow */
export function makeSoftTexture(size=128,inner='rgba(255,255,255,1)',outer='rgba(255,255,255,0)'){
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,inner);g.addColorStop(.42,inner.replace(/,1\)$/,',.55)'));g.addColorStop(1,outer);
  ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

/* Vertical grooved bark — used as a bump map so close-up trunks catch
   directional highlights instead of reading as smooth plastic. */
export function makeBarkTexture(size=256,seed=61){
  const rng=makeRng(seed);
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#8a8a8a';ctx.fillRect(0,0,size,size);
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<70;i++){
      const x=rng()*size;
      const dark=pass===0;
      const g=30+rng()*40;
      ctx.strokeStyle=dark?`rgba(${g|0},${g|0},${g|0},${.22+rng()*.4})`:`rgba(212,212,212,${.1+rng()*.18})`;
      ctx.lineWidth=1+rng()*(dark?4:3);
      ctx.beginPath();
      let px=x;
      ctx.moveTo(px,0);
      for(let y=0;y<=size;y+=16){px=x+Math.sin(y*.05+i*(dark?1:2))*4+(rng()-.5)*3;ctx.lineTo(px,y);}
      ctx.stroke();
    }
  }
  for(let i=0;i<40;i++){
    const x=rng()*size,y=rng()*size,r=3+rng()*10;
    ctx.globalAlpha=.2+rng()*.3;
    ctx.fillStyle=rng()<.5?'#3a3a3a':'#cfcfcf';
    ctx.beginPath();ctx.ellipse(x,y,r,r*1.6,0,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(2,1.4);
  return t;
}

export function makeMoonTexture(size=256,seed=53){
  const rng=makeRng(seed);
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#dfe3ec';ctx.fillRect(0,0,size,size);
  // maria + craters
  for(let i=0;i<26;i++){
    const x=rng()*size,y=rng()*size,r=size*(.03+rng()*.1);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    const dark=rng()<.55;
    g.addColorStop(0,dark?'rgba(163,170,186,.5)':'rgba(246,248,252,.55)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  // limb shading so the sphere reads as lit from the upper-left
  const limb=ctx.createRadialGradient(size*.36,size*.34,size*.1,size*.5,size*.5,size*.62);
  limb.addColorStop(0,'rgba(255,255,255,.25)');
  limb.addColorStop(.6,'rgba(255,255,255,0)');
  limb.addColorStop(1,'rgba(74,82,102,.75)');
  ctx.fillStyle=limb;ctx.fillRect(0,0,size,size);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
