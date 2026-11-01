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
    const count = compact ? 12 : 20;

    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'reg-smoke-wisp';
      span.setAttribute('aria-hidden', 'true');
      span.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;will-change:transform,opacity;border-radius:50%;overflow:visible;mix-blend-mode:screen';
      span.style.background =
        'radial-gradient(circle,rgba(255,40,70,0.7) 0%,rgba(180,20,40,0.5) 40%,rgba(80,10,20,0) 75%)';
      span.style.filter = 'blur(' + (10 + Math.random() * 35) + 'px)';
      span.style.width = (130 + Math.random() * 180) + 'px';
      span.style.height = (130 + Math.random() * 180) + 'px';
      span.style.marginLeft = (-65 - Math.random() * 90) + 'px';
      span.style.marginTop = (-65 - Math.random() * 90) + 'px';
      span.style.left = (Math.random() * 98) + '%';
      span.style.top = (Math.random() * 98) + '%';
      span.style.opacity = '0';
      host.appendChild(span);

      const dur = 5 + i * 1.2 + Math.random() * 3;
      const delay = i * (3 + Math.random() * 5);
      const keyframes = [
        { opacity: 0, transform: 'translate(-6px,-8px) scale(0.5)' },
        {
          opacity: 0.7,
          transform: 'translate(' + (Math.random()*20-10) + 'px,-' + (20+Math.random()*15) + 'px) scale(1.2)',
        },
        { opacity: 0, transform: 'translate(' + (Math.random()*40-20) + 'px,-' + (40+Math.random()*30) + 'px) scale(1.6)' },
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
