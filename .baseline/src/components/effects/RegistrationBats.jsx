import { useEffect, useRef } from 'react';
import './RegistrationBats.css';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function getBatCount() {
  if (typeof window === 'undefined') return 12;
  const w = window.innerWidth;
  if (w < 768) return 6;
  if (w < 1024) return 10;
  return 16;
}

export default function RegistrationBats() {
  const containerRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    if (reduced) return;
    const container = containerRef.current;
    if (!container) return;

    const count = getBatCount();
    const bats = [];

    for (let i = 0; i < count; i++) {
      const bat = document.createElement('div');
      bat.className = 'reg-delphi-bat';
      bat.setAttribute('aria-hidden', 'true');
      
      const size = 70 + Math.random() * 60;
      const startX = Math.random() * 100;
      const startY = Math.random() * 100;
      const duration = 8 + Math.random() * 15;
      const delay = Math.random() * 8;
      
      bat.style.setProperty('--size', size + 'px');
      bat.style.setProperty('--start-x', startX + '%');
      bat.style.setProperty('--start-y', startY + '%');
      bat.style.setProperty('--duration', duration + 's');
      bat.style.setProperty('--delay', delay + 's');
      bat.style.setProperty('--direction', Math.random() > 0.5 ? '1' : '-1');
      
      bat.innerHTML = `
        <svg viewBox="0 0 60 30" class="reg-delphi-bat-svg">
          <path class="reg-delphi-bat-wing reg-delphi-bat-wing-left" d="M30 15 L10 8 L20 11 L5 6 L22 12 L39 12 L31 18 L22 17 Z" />
          <path class="reg-delphi-bat-wing reg-delphi-bat-wing-right" d="M30 15 L50 8 L40 11 L55 6 L38 12 L21 12 L29 18 L38 17 Z" />
          <ellipse class="reg-delphi-bat-body" cx="30" cy="16" rx="2.5" ry="3.5" />
        </svg>
      `;
      
      container.appendChild(bat);
      bats.push(bat);
    }

    return () => {
      bats.forEach(bat => {
        if (bat && bat.parentNode) {
          bat.parentNode.removeChild(bat);
        }
      });
    };
  }, [reduced]);

  return (
    <div 
      ref={containerRef} 
      className="reg-delphi-bats-container" 
      aria-hidden="true"
    />
  );
}
