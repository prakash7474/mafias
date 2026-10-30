import { useEffect, useRef } from 'react';
import RegistrationPageInner from './components/RegistrationPage.jsx';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RegistrationPage({ onBack } = {}) {
  const shellRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    const back = () => {
      if (typeof onBack === 'function') {
        onBack();
      }
    };
    window.addEventListener('mafias:stop-audio', back);
    return () => window.removeEventListener('mafias:stop-audio', back);
  }, [onBack]);

  return (
    <main ref={shellRef} className="registration-shell">
      <RegistrationPageInner onBack={onBack} />
    </main>
  );
}

RegistrationPage.displayName = 'RegistrationPage';
