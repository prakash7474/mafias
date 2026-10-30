import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import FlyingBats from './effects/FlyingBats.jsx';
import RegistrationSmoke from './RegistrationSmoke.jsx';
import RegistrationForm from './RegistrationForm.jsx';
import CharacterPreview from './CharacterPreview.jsx';

const PAGE_WELCOME = 'WELCOME TO REALITY';
const PAGE_SUBHEAD = 'JOIN THE INNER CIRCLE';
const PAGE_COPY =
  'Every legacy begins with a name. Claim your place among the shadows.';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RegistrationPageInner({ onBack } = {}) {
  const shellRef = useRef(null);
  const frameRef = useRef(0);
  const reduced = useMemo(() => prefersReduced(), []);
  const compact = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 820, []);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(reduced);
  const [entered, setEntered] = useState(reduced);

  useEffect(() => {
    setMounted(true);
    if (reduced) {
      setEntered(true);
      return;
    }
    const t = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t) / 650);
      setVisible(p > 0.5);
      if (p >= 1) {
        setEntered(true);
        return;
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    const enterTimer = setTimeout(() => setEntered(true), 2200);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimeout(enterTimer);
    };
  }, [reduced]);

  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, [onBack]);

  useEffect(() => {
    const onHash = () => {
      if (typeof onBack === 'function') {
        onBack();
      }
    };
    window.addEventListener('mafias:stop-audio', onHash);
    return () => window.removeEventListener('mafias:stop-audio', onHash);
  }, [onBack]);

  return (
    <div
      ref={shellRef}
      className={entered ? 'registration-page registration-page--entered' : 'registration-page'}
      style={
        mounted
          ? reduced
            ? { opacity: 1 }
            : { opacity: visible ? 1 : 0, transition: 'opacity .55s ease' }
          : { opacity: 0 }
      }
    >
      <FlyingBats className="registration-bats" />
      <FlyingBats className="registration-bats registration-bats--alt" />
      <FlyingBats className="registration-bats" style={{zIndex:1}} />
      <RegistrationSmoke
        className={
          (reduced || compact) ? 'registration-smoke reg-smoke-compact' : 'registration-smoke'
        }
      />
      <RegistrationSmoke
        className={
          (reduced || compact) ? 'registration-smoke reg-smoke-compact registration-smoke--extra' : 'registration-smoke registration-smoke--extra'
        }
      />
      <RegistrationSmoke
        className={
          (reduced || compact) ? 'registration-smoke reg-smoke-compact' : 'registration-smoke'
        }
        style={{zIndex:6,opacity:0.8}}
      />
      <div className="registration-fog" aria-hidden="true" />
      <div className="registration-embers" aria-hidden="true">
        {[...Array(12)].map((_,i)=>(
          <span key={i} className="registration-ember" style={{'--i':i, left: (Math.random()*100)+'%', animationDelay: (Math.random()*6)+'s'}} />
        ))}
      </div>

      <header className={entered ? 'registration-topbar registration-topbar--entered' : 'registration-topbar'}>
        <button
          className="registration-topbar__back"
          onClick={handleBack}
          type="button"
          aria-label="Return to MAFIAS home"
        >
          <span className="registration-topbar__back-mark" aria-hidden="true" />
          <span className="registration-topbar__back-label">RETURN TO MAFIAS</span>
        </button>
        <button type="button" className="registration-topbar__mark" onClick={(e) => {
          e.preventDefault();
          handleBack();
        }}>
          MΛFIΛS
        </button>
        <span className="registration-topbar__spacer" aria-hidden="true" />
        <span className="registration-topbar__tag">CEG · GUINDY</span>
      </header>

      <section className="registration-stage">
        <div className={entered ? 'registration-copy registration-copy--entered' : 'registration-copy'}>
          <p className="registration-eyebrow">
            <span aria-hidden="true" />
            THE INNER CIRCLE
            <span aria-hidden="true" />
          </p>
          <h1 className="registration-title">{PAGE_WELCOME}</h1>
          <h2 className="registration-subhead">{PAGE_SUBHEAD}</h2>
          <p className="registration-lead">{PAGE_COPY}</p>
        </div>

        <div className={entered ? 'registration-layout registration-layout--entered' : 'registration-layout'}>
          <section className="registration-form-panel">
            <h2 className="registration-panel-title">CLAIM YOUR PLACE</h2>
            <RegistrationForm />
          </section>

          <section
            className="registration-preview-panel"
            aria-label="Vampire character preview"
          >
            <div className="registration-preview-panel__inner">
              <p className="registration-preview-panel__eyebrow">YOUR PLACE AWAITS</p>
              <CharacterPreview />
              <p className="registration-preview-panel__caption">MAFIAS · CEG · GUINDY</p>
            </div>
          </section>
        </div>
      </section>

      <footer className="registration-foot">
        <span>MAFIAS • CEG</span>
        <span>JOIN THE SHADOWS ↓</span>
      </footer>
    </div>
  );
}
