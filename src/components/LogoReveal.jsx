import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function LogoReveal({ onDone }) {
  const shellRef = useRef();
  const fogRef = useRef();
  const logoRef = useRef();
  const sweepRef = useRef();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      gsap.set([shellRef.current, fogRef.current, logoRef.current], { opacity: 1 });
      const t = setTimeout(onDone, 250);
      return () => clearTimeout(t);
    }

    const tl = gsap.timeline({ onComplete: () => onDoneRef.current() });

    tl.to(shellRef.current, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0);

    tl.fromTo(fogRef.current, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'power2.out' }, 0);

    tl.fromTo(logoRef.current,
      { opacity: 0, scale: 0.97, y: 12 },
      { opacity: 1, scale: 1, y: 0, duration: 1.6, ease: 'power2.out' },
      '-=0.7'
    );

    tl.fromTo(sweepRef.current,
      { opacity: 0, x: '-30%' },
      { opacity: 0.6, x: '30%', duration: 1.3, ease: 'power2.inOut' },
      '+=0.15'
    );
    tl.to(sweepRef.current, { opacity: 0, duration: 0.7, ease: 'power2.out' });

    tl.to({}, { duration: 2.0 });

    tl.to([shellRef.current, fogRef.current], { opacity: 0, duration: 0.9, ease: 'power2.in' });

    // Safety fallback: never leave the overlay stuck covering the graveyard.
    const safety = setTimeout(() => {
      tl.kill();
      gsap.to([shellRef.current, fogRef.current], {
        opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => onDoneRef.current(),
      });
    }, 8000);

    return () => {
      tl.kill();
      clearTimeout(safety);
    };
  }, []);

  const skip = () => {
    gsap.to([shellRef.current, fogRef.current], {
      opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => onDoneRef.current(),
    });
  };

  return (
    <div ref={shellRef} className="logo-reveal" aria-hidden="true">
      <div ref={fogRef} className="logo-reveal__fog" />
      <div ref={sweepRef} className="logo-reveal__sweep" />
      <img
        ref={logoRef}
        src="/image/mafias-logo-gold.png"
        alt="MAFIAS Entertainment — gold skull and brand logo"
        className="logo-reveal__logo"
        loading="eager"
        decoding="async"
        width="728"
        height="711"
      />
      <button type="button" className="logo-reveal__skip" onClick={skip}>
        SKIP INTRO
      </button>
    </div>
  );
}