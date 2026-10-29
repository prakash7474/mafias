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
    const count = compact ? 2 : 3;

    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'reg-smoke-wisp';
      span.setAttribute('aria-hidden', 'true');
      span.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;will-change:transform,opacity;border-radius:50%;overflow:visible;mix-blend-mode:screen';
      span.style.background =
        'radial-gradient(circle,rgba(178,24,46,0.3) 0%,rgba(120,8,26,0.18) 35%,rgba(50,2,12,0) 72%)';
      span.style.filter = 'blur(' + (18 + Math.random() * 16) + 'px)';
      span.style.width = (70 + Math.random() * 60) + 'px';
      span.style.height = (70 + Math.random() * 60) + 'px';
      span.style.marginLeft = (-35 - Math.random() * 30) + 'px';
      span.style.marginTop = (-35 - Math.random() * 30) + 'px';
      span.style.left = (8 + Math.random() * 16) + '%';
      span.style.top = (40 + Math.random() * 30) + '%';
      span.style.opacity = '0';
      host.appendChild(span);

      const dur = 7 + i * 1.4 + Math.random() * 2;
      const delay = i * (6 + Math.random() * 4);
      const keyframes = [
        { opacity: 0, transform: 'translate(-4px,-6px) scale(0.7)' },
        {
          opacity: 0.3,
          transform: 'translate(+8px,-12px) scale(1.05)',
        },
        { opacity: 0, transform: 'translate(+24px,-24px) scale(1.25)' },
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
