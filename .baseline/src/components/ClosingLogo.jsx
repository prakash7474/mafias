import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function ClosingLogo({ opacity = 0 }) {
  const shellRef = useRef();
  const logoRef = useRef();
  const hintRef = useRef();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const tl = gsap.timeline();
    tl.fromTo(logoRef.current,
      { opacity: 0, y: 20, filter: 'blur(5px)' },
      { opacity: 1, y: 0, filter: 'blur(0)', duration: 1.5, ease: 'power3.out' }
    );
    tl.fromTo(hintRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 1.0, ease: 'power2.out' },
      '-=0.5'
    );
    return () => tl.kill();
  }, []);

  return (
    <div
      ref={shellRef}
      className="closing-logo"
      aria-hidden="true"
      style={{ opacity }}
    >
      <img
        ref={logoRef}
        src="/image/mafias-logo-distressed.jpg"
        alt="MAFIAS — distressed white skull and brand logo"
        className="closing-logo__logo"
        loading="lazy"
        decoding="async"
        width="720"
        height="720"
      />
      <div ref={hintRef} className="closing-logo__hint">
        <span /> SCROLL BACK <span />
      </div>
    </div>
  );
}