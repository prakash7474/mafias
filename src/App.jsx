import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { gsap } from 'gsap';
import { Howl } from 'howler';
import GraveyardScene from './scene/GraveyardScene.jsx';
import { stormSettings } from './scene/lightning.js';
import LogoReveal from './components/LogoReveal.jsx';
import ClosingLogo from './components/ClosingLogo.jsx';

function supportsWebGL(){
  if(typeof document==='undefined')return false;
  try{
    const c=document.createElement('canvas');
    return !!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl')));
  }catch(e){return false;}
}

export default function App(){
  const [webgl]=useState(supportsWebGL);
  const [soundOn,setSoundOn]=useState(false);
  const [flashesOn,setFlashesOn]=useState(true);
  const [entering,setEntering]=useState(false);
  const [entered,setEntered]=useState(false);
  const [ready, setReady]=useState(false);
  const [introDone,setIntroDone]=useState(false);
  const [scrollProgress,setScrollProgress]=useState(0);
  const drone=useRef(null), whoosh=useRef(null), overlay=useRef(null), enterBtn=useRef(null);
  useEffect(()=>{
    drone.current=new Howl({
      src:['/audio/Danny_Elfman_Wednesday_OST_-_Wednesday_Main_Titles_2022_(mp3.pm).mp3','/audio/dark-drone.mp3'],
      loop:true,volume:.24,html5:true,
      onloaderror:()=>{console.info('Audio missing: add a background loop at public/audio/dark-drone.mp3');setSoundOn(false);},
      onplayerror:()=>{console.info('Audio playback blocked or unavailable; sound stays off.');setSoundOn(false);}});
    whoosh.current=new Howl({src:['/audio/graveyard-whoosh.mp3'],volume:.6,
      onloaderror:()=>console.info('Audio missing: add optional public/audio/graveyard-whoosh.mp3'),
      onplayerror:()=>console.info('Whoosh could not be played; continuing silently.')});
    return ()=>{drone.current?.unload();whoosh.current?.unload();};
  },[]);
  const toggleSound=useCallback(()=>{
    const next=!soundOn;setSoundOn(next);
    stormSettings.sound=next;
    if(next) drone.current?.play(); else drone.current?.pause();
  },[soundOn]);
  // lightning can be switched off on its own, independently of sound
  const toggleFlashes=useCallback(()=>{
    const next=!flashesOn;setFlashesOn(next);
    stormSettings.flashes=next;
  },[flashesOn]);
  const enter=useCallback(()=>{
    if(entering||entered)return;
    setEntering(true);if(soundOn)whoosh.current?.play();
    document.body.classList.add('mafias-entering');
    window.dispatchEvent(new CustomEvent('mafias:enter'));
    const tl=gsap.timeline({onComplete:()=>{
      setEntered(true);setEntering(false);
      document.body.classList.remove('mafias-entering');
      window.dispatchEvent(new CustomEvent('mafias:entered'));
    }});
    if(enterBtn.current)tl.to(enterBtn.current,{opacity:0,y:10,duration:.22},0);
    if(overlay.current)tl.to(overlay.current,{opacity:1,duration:.45,ease:'power2.in'},.1);
    tl.to({}, {duration:1.5});
    if(overlay.current)tl.to(overlay.current,{opacity:0,duration:.6,ease:'power2.out'});
  },[entering,entered,soundOn]);
  // fade the fixed hero/footer out as soon as the descent begins so story panels stay readable
  const fade = entering||entered ? 1 : Math.max(0,1-scrollProgress/.06);
  const closingOpacity = Math.max(0,Math.min(1,(scrollProgress-0.72)/0.28));
  const replay=()=>window.location.reload();
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
      ? <div className="canvas"><Canvas dpr={[1,1.45]} camera={{position:[0,2.7,12],fov:48}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.setClearColor('#07080b',1);setReady(true);}}><GraveyardScene/></Canvas></div>
      : <div className="canvas fallback" role="img" aria-label="A moonlit graveyard under a dark sky"/>}
    <div className="shade"/><div className="grain"/>
    <div className="scroll-progress" style={{transform:`scaleX(${scrollProgress})`}} aria-hidden="true"/>
    <header className="topbar"><a className="brand" href="#home" aria-label="MAFIAS home">MΛFIΛS</a><span className="descriptor"><i/> CEG · GUINDY</span><button className={`sound ${soundOn?'on':''}`} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn?'Turn sound off':'Turn sound on'}><span className="bars"><i/><i/><i/><i/></span>SOUND {soundOn?'ON':'OFF'}</button><button className={`storm ${flashesOn?'on':''}`} onClick={toggleFlashes} aria-pressed={flashesOn} aria-label={flashesOn?'Turn lightning flashes off':'Turn lightning flashes on'}>FLASH {flashesOn?'ON':'OFF'}</button></header>
    {/* DISABLED */}
    {!entered&&<section className="hero" id="home" style={{opacity:fade,pointerEvents:fade<.05?'none':'auto'}}><p className="eyebrow"><span/> CEG'S UNOFFICIAL VARIETY TEAM <span/></p><h1>PERFORM.<br/><em>CREATE. ENTERTAIN.</em></h1><p className="copy">We entertain, create and inspire —<br/>right here at CEG, Guindy.</p><button ref={enterBtn} className="enter" onClick={enter} disabled={entering}>{entering?'CROSSING OVER…':'ENTER MAFIAS'} <b>↗</b></button><p className="hint">TURN SOUND ON FOR THE FULL EXPERIENCE</p></section>}
    <footer style={{opacity:fade,pointerEvents:fade<.05?'none':'auto'}}><span>MAFIAS • CEG</span><span>SCROLL TO DESCEND ↓</span></footer>
    <div className="scroll-story" aria-hidden="true">
      <section className="story-panel story-two"><span className="story-index">02 / ON THE STAGE</span><h2>THE NIGHT<br/><em>IS A SHOW.</em></h2><p>Bringing campus moments to life.</p></section>
      <section className="story-panel story-three"><span className="story-index">03 / THE CIRCLE</span><h2>TALENT MEETS<br/><em>ENTERTAINMENT.</em></h2><p>Making memories, one performance at a time.</p></section>
    </div>
    <div ref={overlay} className={`transition ${entering?'active':''}`} aria-hidden="true"><div className="ring"/></div>
    {entered&&<section className="arrival" aria-live="polite"><p className="eyebrow"><span/> YOU HAVE CROSSED OVER <span/></p><h2>WELCOME TO<br/><em>MAFIAS — CEG.</em></h2><p>Showcasing talent, creating experiences.</p><button onClick={replay}>REPLAY EXPERIENCE ↺</button></section>}
    {entered&&<ClosingLogo opacity={closingOpacity}/>}
    {!ready&&<div className="loading">THE GRAVEYARD IS WAKING…</div>}
    <span className="sr" role="status">{entering?'Entering MAFIAS':entered?'Welcome to MAFIAS':''}</span>
  </main>;
}