import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import RegistrationPageInner from './components/RegistrationPage.jsx';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RegistrationPage() {
  const navigate = useNavigate();
  const shellRef = useRef(null);
  const reduced = prefersReduced();

  useEffect(() => {
    const back = () => navigate('/register', { replace: true });
    window.addEventListener('mafias:stop-audio', back);
    return () => window.removeEventListener('mafias:stop-audio', back);
  }, [navigate]);

  return (
    <main ref={shellRef} className="registration-shell">
      <RegistrationPageInner />
      <Outlet />
    </main>
  );
}

RegistrationPage.displayName = 'RegistrationPage';
