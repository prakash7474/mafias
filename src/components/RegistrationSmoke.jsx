import { useRef, useEffect } from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FRAME = '0 0 120 60';

const WING = {
  d: 'M60 30 L30 18 L48 22 L22 12 L50 24 L78 24 L62 36 L44 34 Z',
  fill: '#07070a',
  stroke: '#020204',
  sw: 1.2,
};

const SWEEP = (x, y, size) =>
  'translate(' + x + 'px,' + y + 'px) scale(' + size + ') rotate(' + (Math.sin(performance.now() * 0.001 * 0.9 + Math.random() * 6) * 0.25) + 'rad)';

function RegistrationSmokeRaw({ className }) {
  const hostRef = useRef(null);
  const reduced = prefersReduced();
  const compact = typeof window !== 'undefined' && window.innerWidth < 820;

  useEffect(() => {
    if (reduced) return () => {};

    const host = hostRef.current;
    if (!host) return () => {};

    const rect = host.getBoundingClientRect();
    const inset = [0, 0, Math.max(rect.width, 1), Math.max(rect.height, 1)];
    const count = compact ? 6 : 10;

    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'reg-smoke-wisp';
      span.setAttribute('aria-hidden', 'true');
      span.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;will-change:transform,opacity;border-radius:50%;overflow:visible;mix-blend-mode:screen';
      span.style.background =
        'radial-gradient(circle,rgba(220,40,70,0.6) 0%,rgba(160,20,40,0.35) 40%,rgba(80,10,20,0) 75%)';
      span.style.filter = 'blur(' + (14 + Math.random() * 28) + 'px)';
      span.style.width = (110 + Math.random() * 140) + 'px';
      span.style.height = (110 + Math.random() * 140) + 'px';
      span.style.marginLeft = (-55 - Math.random() * 70) + 'px';
      span.style.marginTop = (-55 - Math.random() * 70) + 'px';
      span.style.left = (Math.random() * 95) + '%';
      span.style.top = (Math.random() * 95) + '%';
      span.style.opacity = '0';
      host.appendChild(span);

      const dur = 7 + i * 1.4 + Math.random() * 2;
      const delay = i * (6 + Math.random() * 4);
      const keyframes = [
        { opacity: 0, transform: 'translate(-4px,-6px) scale(0.6)' },
        {
          opacity: 0.5,
          transform: 'translate(+10px,-15px) scale(1.1)',
        },
        { opacity: 0, transform: 'translate(+30px,-30px) scale(1.4)' },
      ];
      const animation = span.animate(keyframes, {
        duration: dur * 1000,
        delay: delay * 1000,
        iterations: Infinity,
        easing: 'ease-out',
      });
      span._cancel = () => animation.cancel();
    }

    return () => {
      for (const w of host.querySelectorAll('.reg-smoke-wisp')) {
        if (w && w._cancel) w._cancel();
      }
    };
  }, [reduced, compact]);

  return (
    <span
      ref={hostRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        contain: 'strict',
        zIndex: 2,
      }}
      aria-hidden="true"
    />
  );
}
RegistrationSmokeRaw._original = RegistrationSmokeRaw;
export default RegistrationSmokeRaw;
