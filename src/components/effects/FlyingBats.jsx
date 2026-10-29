import { useRef, useEffect } from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BATS_DESKTOP = 10;
const BATS_MOBILE = 4;

export default function FlyingBats({ className }) {
  const hostRef = useRef(null);
  const rafRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) return () => {};

    const host = hostRef.current;
    if (!host) return () => {};

    const rect = host.getBoundingClientRect();
    const compact = window.innerWidth < 820;
    const count = compact ? BATS_MOBILE : BATS_DESKTOP;

    // Create bats in memory, attach to host
    const batEls = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'reg-bat-instance';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:absolute;top:0;left:0;width:120px;height:60px;pointer-events:none;will-change:transform,opacity;overflow:visible';
      el.innerHTML =
        '<svg viewBox="0 0 120 60" style="display:block;width:100%;height:100%;overflow:visible" aria-hidden="true">' +
        '<path class="reg-bat__wing-l" d="M60 30 L28 16 L48 22 L18 12 L50 24 L78 24 L62 36 L44 34 Z" fill="#07070a" stroke="#020204" stroke-width="1.2"/>' +
        '<path class="reg-bat__wing-r" d="M60 30 L92 16 L72 22 L102 12 L70 24 L42 24 L58 36 L76 34 Z" fill="#07070a" stroke="#020204" stroke-width="1.2"/>' +
        '<ellipse class="reg-bat__body" cx="60" cy="32" rx="5" ry="7" fill="#050509"/>' +
        '</svg>';
      host.appendChild(el);
      batEls.push(el);
    }

    // Seed bat parameters
    const rng = mulberry32(9021);
    const seeds = batEls.map(() => ({
      x: compact
        ? rect.width * (0.05 + rng() * 0.55)
        : -12 + rng() * (rect.width + 24),
      y: compact
        ? rect.height * (0.18 + rng() * 0.5)
        : rect.height * (0.06 + rng() * 0.7),
      speed: 0.45 + rng() * 0.5,
      flapSpeed: 4 + rng() * 4,
      size: compact ? 0.6 + rng() * 0.4 : 0.7 + rng() * 0.9,
      dir: rng() < 0.5 ? 1 : -1,
      drift: compact ? 0.25 : 0.4 + rng() * 0.6,
      phase: rng() * Math.PI * 2,
    }));

    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now * 0.001;

      for (let i = 0; i < count; i++) {
        const b = seeds[i];
        const s = Math.max(8, 60 * b.size);
        const x =
          b.x +
          b.dir * (b.drift * Math.sin(t * 0.4 + i) + ((t * 0.35 * b.dir) % 12));
        const y = b.y + Math.sin(t * 1.1 + i) * (compact ? 6 : 12);
        const flap = Math.sin(t * b.flapSpeed + i * 1.3);
        const rot = Math.sin(t * 0.9 + i * 0.6) * 0.25 * b.dir;

        const el = batEls[i];
        if (!el) continue;

        el.style.transform =
          'translate(' + x + 'px,' + y + 'px) scale(' + b.size + ') rotate(' + rot + 'rad)';
        el.style.opacity = b.size > 0.7 ? '1' : '0.45';

        const wl = el.querySelector('.reg-bat__wing-l');
        const wr = el.querySelector('.reg-bat__wing-r');
        if (wl) wl.style.transform = 'scaleY(' + (1 - flap * 0.45) + ')';
        if (wr) wr.style.transform = 'scaleY(' + (1 - flap * 0.45) + ')';
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const el of batEls) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }, [reduced]);

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
