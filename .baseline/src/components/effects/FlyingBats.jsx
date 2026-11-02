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

const BATS_DESKTOP = 12;
const BATS_TABLET = 9;
const BATS_MOBILE = 6;

export default function FlyingBats({ className }) {
  const hostRef = useRef(null);
  const rafRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) return () => {};

    const host = hostRef.current;
    if (!host) return () => {};

    const rect = host.getBoundingClientRect();
    const width = window.innerWidth;
    const compact = width < 820;
    const tablet = width >= 820 && width < 1100;
    const count = compact ? BATS_MOBILE : tablet ? BATS_TABLET : BATS_DESKTOP;

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
        '<path class="reg-bat__wing-l" d="M60 30 L28 16 L48 22 L18 12 L50 24 L78 24 L62 36 L44 34 Z" fill="#0a0a0f" stroke="#030305" stroke-width="1.2"/>' +
        '<path class="reg-bat__wing-r" d="M60 30 L92 16 L72 22 L102 12 L70 24 L42 24 L58 36 L76 34 Z" fill="#0a0a0f" stroke="#030305" stroke-width="1.2"/>' +
        '<ellipse class="reg-bat__body" cx="60" cy="32" rx="5" ry="7" fill="#060608"/>' +
        '<circle cx="58" cy="30" r="1.2" fill="#E12A45" opacity="0.9"/>' +
        '<circle cx="62" cy="30" r="1.2" fill="#E12A45" opacity="0.9"/>' +
        '</svg>';
      host.appendChild(el);
      batEls.push(el);
    }

    // Seed bat parameters
    const rng = mulberry32(9021);
    const seeds = batEls.map((_, i) => ({
      x: rng() < 0.5 ? -40 - rng() * 80 : rect.width + 40 + rng() * 80,
      y: rect.height * (0.1 + rng() * 0.6),
      vx: (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.45),
      vy: (rng() - 0.5) * (0.12 + rng() * 0.18),
      flapSpeed: 5 + rng() * 6,
      size: compact ? 0.6 + rng() * 0.4 : 0.7 + rng() * 0.8,
      dir: rng() < 0.5 ? -1 : 1,
      wave: rng() * Math.PI * 2,
      t: rng() * 10,
    }));

    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now * 0.001;

      for (let i = 0; i < count; i++) {
        const b = seeds[i];
        b.t += dt;
        b.x += b.vx * (60 * dt) + Math.sin(t * 0.6 + i + b.wave) * (0.4 + b.dir * 0.3);
        b.y += b.vy * (40 * dt) + Math.cos(t * 0.9 + i) * (2 + i % 2);

        if (b.x < -120) b.x = rect.width + 80;
        if (b.x > rect.width + 120) b.x = -80;
        if (b.y < -40) b.y = rect.height * 0.8;
        if (b.y > rect.height + 40) b.y = rect.height * 0.1;

        const flap = Math.sin(t * b.flapSpeed + i * 1.7);
        const rot = Math.sin(t * 0.8 + i * 0.5) * 0.18 * b.dir;

        const el = batEls[i];
        if (!el) continue;

        el.style.transform =
          'translate(' + b.x + 'px,' + b.y + 'px) scale(' + b.size + ') rotate(' + rot + 'rad)';
        el.style.opacity = b.size > 0.5 ? (0.85 + flap * 0.15) : (0.6 + flap * 0.25);

        const wl = el.querySelector('.reg-bat__wing-l');
        const wr = el.querySelector('.reg-bat__wing-r');
        if (wl) wl.style.transform = 'scaleY(' + (1 - flap * 0.5) + ')';
        if (wr) wr.style.transform = 'scaleY(' + (1 - flap * 0.5) + ')';
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
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
