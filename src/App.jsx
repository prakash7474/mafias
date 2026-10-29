import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { gsap } from 'gsap';
import { Howl, Howler } from 'howler';
import GraveyardScene from './scene/GraveyardScene.jsx';
import { stormSettings } from './scene/lightning.js';
import { introSmoke, mountIntroSmoke, unmountIntroSmoke } from './scene/introSmoke.js';
import { warmIntroSmokeAssets } from './scene/IntroSmoke.jsx';

/* The edited 4.2 s swoosh. Served from /public, never from a CDN, and always
   started from zero on the click. If the file is absent the entrance still
   plays in full — the timeline never waits on audio. */
const INTRO_AUDIO = '/audio/mafias-smoke-intro.mp3';
/* The real MAFIAS identity asset, at its original proportions. */
const LOGO_SRC = '/image/mafias-logo-distressed.jpg';
const WELCOME = 'WELCOME TO MAFIAS';

/* Transition states. Only one can be active, and `started` latches on the
   first click so the sequence can never run twice or rewind mid-way. */
const PHASE = {
  IDLE: 'idle',
  CAMERA_PUSH: 'cameraPush',
  RED_FLASH: 'redFlash',
  SMOKE_EXPAND: 'smokeExpand',
  SMOKE_COVERED: 'smokeCovered',
  WELCOME: 'welcomeReveal',
  LOGO: 'logoReveal',
  COMPLETE: 'complete'
};

function supportsWebGL(){
  if(typeof document==='undefined')return false;
  try{
    const c=document.createElement('canvas');
    return !!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl')));
  }catch(e){return false;}
}

function prefersReduced(){
  return typeof window!=='undefined'&&!!window.matchMedia
    &&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function App(){
  const [webgl]=useState(supportsWebGL);
  const [soundOn,setSoundOn]=useState(false);
  const [flashesOn,setFlashesOn]=useState(true);
  const [introState,setIntroState]=useState(PHASE.IDLE);
  const [ready,setReady]=useState(false);
  const [scrollProgress,setScrollProgress]=useState(0);

  const entering=introState!==PHASE.IDLE&&introState!==PHASE.COMPLETE;
  const entered=introState===PHASE.COMPLETE;

  const drone=useRef(null);
  const sting=useRef(null);
  const enterBtn=useRef(null);
  const duckT=useRef(null);
  const timeline=useRef(null);
  const started=useRef(false);
  const flashRef=useRef(null);
  const welcomeRef=useRef(null);
  const logoLayerRef=useRef(null);
  const logoRef=useRef(null);
  const logoGlowRef=useRef(null);
  /* Scroll position where the sequence finished — the logo fades out from
     here as the visitor descends, not from the top of the page (the intro
     can now start halfway down, and the mark must still be seen). */
  const doneAt=useRef(0);

  /* ---- audio assets (created once, never autoplayed) ---- */
  useEffect(()=>{
    document.body.classList.add('mafias-static');
    // build the smoke textures while the page is idle so the 0.45 s mount
    // of the field costs no main-thread time at all
    warmIntroSmokeAssets();
    drone.current=new Howl({
      src:['/audio/Danny_Elfman_Wednesday_OST_-_Wednesday_Main_Titles_2022_(mp3.pm).mp3','/audio/dark-drone.mp3'],
      loop:true,volume:.24,html5:true,
      onloaderror:()=>{console.info('Audio missing: add a background loop at public/audio/dark-drone.mp3');setSoundOn(false);},
      onplayerror:()=>{console.info('Audio playback blocked or unavailable; sound stays off.');setSoundOn(false);}});
    sting.current=new Howl({
      src:[INTRO_AUDIO],volume:.85,preload:true,html5:false,
      // a missing or blocked sting must never stall the visual sequence
      onloaderror:()=>console.info(`Entrance sting not found at ${INTRO_AUDIO}; the sequence continues silently.`),
      onplayerror:()=>console.info('Entrance sting was blocked by the browser; the sequence continues silently.')});
    return ()=>{
      document.body.classList.remove('mafias-static');
      drone.current?.unload();
      sting.current?.unload();
    };
  },[]);

  const toggleSound=useCallback(()=>{
    if(entering||entered)return;
    const next=!soundOn;setSoundOn(next);
    stormSettings.sound=next;
    if(next){stormSettings.paused=false;drone.current?.play();} else drone.current?.stop();
  },[soundOn,entering,entered]);

  // lightning can be switched off on its own, independently of sound
  const toggleFlashes=useCallback(()=>{
    if(entering||entered)return;
    const next=!flashesOn;setFlashesOn(next);
    stormSettings.flashes=next;
  },[flashesOn,entering,entered]);

  /* Thunder rumble (one-shot, ~100 ms after the flash) briefly ducks the
     background track so it cuts through the mix, then restores the exact
     authored volume. Nothing loops and no React state is touched. */
  useEffect(()=>{
    const BASE=.24,LOW=.12,RESTORE=1.6;
    const duck=()=>{
      const d=drone.current;
      if(!d||entering||entered)return;
      d.volume(LOW);
      clearTimeout(duckT.current);
      duckT.current=setTimeout(()=>{if(drone.current)drone.current.volume(BASE);},RESTORE*1000);
    };
    window.addEventListener('mafias:thunder',duck);
    return ()=>{window.removeEventListener('mafias:thunder',duck);clearTimeout(duckT.current);};
  },[entering,entered]);

  /* ------------------------------------------------------------------ *
   * The entrance: one timeline, seven named labels.
   *
   *   0.00  start           silence ambience, sting from zero, latch state
   *   0.15  camera-push     short push toward the orb, hero + chrome out
   *   0.35  red-flash       orb flares, crimson flash covers the frame
   *   0.45  smoke-expand    react-smoke mounts, cloud bursts out of the orb
   *   1.45  smoke-covered   full viewport coverage (acceptance criterion)
   *   1.80  welcome-reveal  WELCOME TO MAFIAS, letter by letter
   *   2.70  logo-reveal     real MAFIAS mark, smoke thins around it
   *   3.60  settle          smoke gone, logo held, scroll handed back
   *
   * Every visual in the sequence hangs off this clock — there is no second
   * timer for the camera, the smoke, the text or the logo. The sting is
   * never time-stretched to match the visuals.
   * ------------------------------------------------------------------ */
  const enter=useCallback(()=>{
    if(started.current)return;
    started.current=true;

    /* The sting plays in real time, so the timeline must be wall-clock too:
       GSAP's default lag smoothing pauses the clock on any frame longer than
       500 ms, which would drag every later phase permanently behind the
       audio. Disabled for the sequence, restored the moment it settles. */
    gsap.ticker.lagSmoothing(0);

    const reduced=prefersReduced();

    /* PHASE A — 00.00–00.15 */
    stormSettings.paused=true;
    stormSettings.sound=false;
    Howler.stop();
    clearTimeout(duckT.current);
    window.dispatchEvent(new CustomEvent('mafias:stop-audio'));
    setSoundOn(false);
    const audio=sting.current;
    if(audio){
      try{audio.stop();audio.volume(reduced?.5:.85);audio.play();}
      catch(e){console.info('Entrance sting could not start; continuing silently.');}
    }

    document.body.classList.remove('mafias-static');
    document.body.classList.add('mafias-entering');
    document.documentElement.classList.add('mafias-entering');
    setIntroState(PHASE.CAMERA_PUSH);

    const smoke={ramp:0,alpha:0};
    const pushSmoke=()=>{introSmoke.ramp=smoke.ramp;introSmoke.alpha=smoke.alpha;};
    const letters=welcomeRef.current
      ?Array.from(welcomeRef.current.querySelectorAll('.welcome-letter'))
      :[];

    const finish=()=>{
      timeline.current=null;
      gsap.ticker.lagSmoothing(500,33);
      const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
      doneAt.current=Math.min(1,Math.max(0,window.scrollY/max));
      setIntroState(PHASE.COMPLETE);
      document.body.classList.remove('mafias-entering');
      document.documentElement.classList.remove('mafias-entering');
      window.dispatchEvent(new CustomEvent('mafias:entered'));
      unmountIntroSmoke();
      sting.current?.stop();   // stays silent after the reveal
    };

    const tl=gsap.timeline({onComplete:finish});
    timeline.current=tl;

    tl.addLabel('start',0)

      /* PHASE B — camera push + hero out (00.15–00.50) */
      .addLabel('camera-push',.15)
      .call(()=>window.dispatchEvent(new CustomEvent('mafias:enter',{
        detail:{duration:reduced?.24:.36}
      })),null,.15)
      .to('.hero .eyebrow, .hero h1, .hero .copy, .hero .hint',
        {opacity:0,y:-12,duration:.34,stagger:.03,ease:'power2.out'},.14)
      .to(enterBtn.current,{opacity:0,y:10,duration:.26,ease:'power2.out'},.14)
      .to('.topbar, .experience footer',{opacity:0,duration:.3,ease:'power1.out'},.2)

      /* PHASE C — red flash (00.35–00.80) */
      .addLabel('red-flash',.35)
      .call(()=>{
        setIntroState(PHASE.RED_FLASH);
        window.dispatchEvent(new CustomEvent('mafias:portal-pulse'));
      },null,.35)
      /* A slightly longer flash than a single frame: the smoke field mounts
         at 0.45 and its first frame compiles shaders, so a 90 ms spike can
         be swallowed whole on a slow device. */
      .fromTo(flashRef.current,{opacity:0},
        {opacity:reduced?.45:.92,duration:.12,ease:'sine.out',immediateRender:false},.34)
      .to(flashRef.current,{opacity:0,duration:.38,ease:'power2.out'},.5)

      /* PHASE D — smoke burst (00.45–01.45) */
      .addLabel('smoke-expand',.45)
      .call(()=>{
        setIntroState(PHASE.SMOKE_EXPAND);
        mountIntroSmoke();
      },null,.45)
      /* ramp = how far the cloud has grown; alpha = how thick it is. The
         thickness lands early (1.30 s) so the screen is genuinely opaque
         before the 1.45 s criterion, while the cloud is still expanding. */
      .to(smoke,{ramp:1.15,duration:1,ease:'power1.in',onUpdate:pushSmoke},.45)
      .to(smoke,{alpha:1,duration:.65,ease:'power2.out',onUpdate:pushSmoke},.45)

      /* PHASE E — fully covered (01.45–01.80) */
      .addLabel('smoke-covered',1.45)
      /* the orb has poured out its cloud — veil the geometry itself so the
         cover is unambiguous (it is nearer the lens than the smoke wall on
         the scroll-arrival path and would read through it) */
      .call(()=>{
        setIntroState(PHASE.SMOKE_COVERED);
        window.dispatchEvent(new CustomEvent('mafias:portal-veil'));
      },null,1.45)

      /* PHASE F — WELCOME TO MAFIAS (01.80–02.70) */
      .addLabel('welcome-reveal',1.8)
      .to(welcomeRef.current,{opacity:1,duration:.18,ease:'none'},1.76)
      .call(()=>setIntroState(PHASE.WELCOME),null,1.8);

    letters.forEach((letter,i)=>{
      const dir=i%2?-1:1;
      tl.fromTo(letter,
        {opacity:0,x:dir*14,y:16,rotate:dir*5,scale:1.1,
          '--letter-blur':reduced?'0px':'12px'},
        {opacity:1,x:0,y:0,rotate:0,scale:1,'--letter-blur':'0px',
          duration:.48,ease:'power2.out',immediateRender:false},
        1.8+i*.026);
    });

    tl
      /* PHASE G — real MAFIAS mark (02.70–03.60) */
      .addLabel('logo-reveal',2.7)
      .to(welcomeRef.current,{opacity:0,duration:.3,ease:'power1.out'},2.7)
      .call(()=>setIntroState(PHASE.LOGO),null,2.7)
      .to(logoLayerRef.current,{opacity:1,duration:.45,ease:'power2.out'},2.74)
      .fromTo(logoRef.current,
        {opacity:0,scale:.94,y:14,'--logo-blur':'10px'},
        {opacity:1,scale:1,y:0,'--logo-blur':'0px',
          duration:.85,ease:'power3.out',immediateRender:false},2.78)
      /* restrained red rim-light pulse — its own layer, so the logo's blur
         and the glow never fight over one filter property */
      .fromTo(logoGlowRef.current,
        {opacity:0,scale:.82},
        {opacity:1,scale:1,duration:.5,ease:'sine.out',immediateRender:false},2.92)
      .to(logoGlowRef.current,{opacity:.55,scale:1.08,duration:1,ease:'sine.inOut'},3.45)
      .to(smoke,{ramp:1.4,alpha:.62,duration:.9,ease:'sine.out',onUpdate:pushSmoke},2.8)

      /* PHASE H — settle (03.60–04.20) */
      .addLabel('settle',3.6)
      .to(smoke,{alpha:0,duration:.6,ease:'power2.in',onUpdate:pushSmoke},3.6)
      .to({},{duration:.05},4.15);   // hold to 4.2 s — the length of the sting

    /* Reduced motion keeps the same order, plays it faster and drops the
       flash/blur weight; the audio still runs at its authored speed. */
    if(reduced)tl.timeScale(1.35);
  },[]);

  useEffect(()=>()=>{
    timeline.current?.kill();
    gsap.ticker.lagSmoothing(500,33);
    clearTimeout(duckT.current);
    document.body.classList.remove('mafias-entering');
    document.documentElement.classList.remove('mafias-entering');
  },[]);

  /* Reaching the orb starts the same sequence as the button: the scene
     dispatches once when the scroll carries the camera all the way in, and
     the `started` latch inside `enter` makes a double-fire impossible. */
  useEffect(()=>{
    const auto=()=>enter();
    window.addEventListener('mafias:enter-auto',auto);
    return ()=>window.removeEventListener('mafias:enter-auto',auto);
  },[enter]);

  // fade the fixed hero/footer out as soon as the descent begins so story panels stay readable
  const fade = entering||entered ? 1 : Math.max(0,1-scrollProgress/.06);
  useEffect(()=>{if(!webgl)setReady(true);},[webgl]);
  useEffect(()=>{
    const update=()=>{
      const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
      const progress=Math.min(1,Math.max(0,window.scrollY/max));
      setScrollProgress(progress);
      window.dispatchEvent(new CustomEvent('mafias:scroll',{detail:{progress}}));
    };
    window.addEventListener('scroll',update,{passive:true}); update();
    return ()=>window.removeEventListener('scroll',update);
  },[]);

  return <main className="experience">
    {webgl
      ? <div className="canvas"><Canvas frameloop="always" dpr={[1,1.25]} camera={{position:[0,2.7,12],fov:48}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.setClearColor('#07080b',1);setReady(true);}}><GraveyardScene/></Canvas></div>
      : <div className="canvas fallback" role="img" aria-label="A moonlit graveyard under a dark sky"/>}
    <div className="shade"/><div className="grain"/>
    <div className="scroll-progress" style={{transform:`scaleX(${scrollProgress})`}} aria-hidden="true"/>
    <header className="topbar"><a className="brand" href="#home" aria-label="MAFIAS home">MΛFIΛS</a><span className="descriptor"><i/> CEG · GUINDY</span><button className={`sound ${soundOn?'on':''}`} onClick={toggleSound} aria-pressed={soundOn} disabled={entering||entered} aria-label={soundOn?'Turn sound off':'Turn sound on'}><span className="bars"><i/><i/><i/><i/></span>SOUND {soundOn?'ON':'OFF'}</button><button className={`storm ${flashesOn?'on':''}`} onClick={toggleFlashes} aria-pressed={flashesOn} disabled={entering||entered} aria-label={flashesOn?'Turn lightning flashes off':'Turn lightning flashes on'}>FLASH {flashesOn?'ON':'OFF'}</button></header>
    {!entered&&<section className="hero" id="home" style={{opacity:fade,pointerEvents:fade<.05?'none':'auto'}}><p className="eyebrow"><span/> CEG'S UNOFFICIAL VARIETY TEAM <span/></p><h1>PERFORM.<br/><em>CREATE. ENTERTAIN.</em></h1><p className="copy">We entertain, create and inspire —<br/>right here at CEG, Guindy.</p><button ref={enterBtn} className="enter" onClick={enter} disabled={entering}>{entering?'CROSSING OVER…':'ENTER MAFIAS'} <b>↗</b></button><p className="hint">TURN SOUND ON FOR THE FULL EXPERIENCE</p></section>}
    <footer style={{opacity:fade,pointerEvents:fade<.05?'none':'auto'}}><span>MAFIAS • CEG</span><span>SCROLL TO DESCEND ↓</span></footer>
    <div className="scroll-story" aria-hidden="true">
      <section className="story-panel story-two"><span className="story-index">02 / ON THE STAGE</span><h2>THE NIGHT<br/><em>IS A SHOW.</em></h2><p>Bringing campus moments to life.</p></section>
      <section className="story-panel story-three"><span className="story-index">03 / THE CIRCLE</span><h2>TALENT MEETS<br/><em>ENTERTAINMENT.</em></h2><p>Making memories, one performance at a time.</p></section>
    </div>

    {/* Transition layers. Always mounted so the timeline can address them,
        hidden until their label fires — nothing is shown early. */}
    <div ref={flashRef} className="intro-flash" aria-hidden="true"/>
    <section ref={welcomeRef} className="welcome-intro"
      data-show={introState===PHASE.WELCOME||introState===PHASE.LOGO?'true':'false'}
      aria-hidden={introState!==PHASE.WELCOME}>
      <h2>{WELCOME.split('').map((char,i)=>
        <span key={i} className="welcome-letter">{char===' '?'\u00a0':char}</span>)}</h2>
    </section>
    <section className="logo-intro" ref={logoLayerRef}
      data-show={introState===PHASE.LOGO||entered?'true':'false'}
      aria-hidden={introState!==PHASE.LOGO&&!entered}
      aria-label="MAFIAS logo reveal"
      style={entered?{opacity:Math.min(1,Math.max(0,1-(scrollProgress-doneAt.current)*12))}:undefined}>
      <span ref={logoGlowRef} className="logo-intro__glow" aria-hidden="true"/>
      <img ref={logoRef} src={LOGO_SRC} alt="MAFIAS distressed skull logo" width="720" height="720" decoding="async"/>
      <p>SCROLL TO DESCEND</p>
    </section>

    {!ready&&<div className="loading">THE GRAVEYARD IS WAKING…</div>}
    <span className="sr" role="status">{entering?'Entering MAFIAS':entered?'Welcome to MAFIAS':''}</span>
  </main>;
}
