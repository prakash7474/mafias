import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTagConfig } from './TagSelector.jsx';

const TRANSITION_MS = 260;
const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CharacterPreview() {
  const { findById } = useTagConfig();
  const [gender, setGender] = useState('male');
  const [tagId, setTagId] = useState('red');
  const [src, setSrc] = useState('');
  const [oldSrc, setOldSrc] = useState('');
  const [phase, setPhase] = useState('idle');
  const imgRef = useRef(null);
  const timerRef = useRef(0);
  const reduced = useMemo(() => prefersReduced(), []);

  const resolveSrc = useCallback(
    (g, t) => {
      if (!g || !t) return '';
      return '/mafias-character-assets/' + g + '-' + t + '.png';
    },
    []
  );

  const transitionTo = useCallback(
    (nextSrc, immediate) => {
      if (!nextSrc) {
        setOldSrc('');
        setSrc('');
        setPhase('idle');
        return;
      }
      if (immediate || reduced) {
        setOldSrc('');
        setSrc(nextSrc);
        setPhase('idle');
        return;
      }
      setOldSrc(src);
      setSrc(nextSrc);
      if (phase !== 'entering') {
        setPhase('leaving');
        timerRef.current = window.setTimeout(() => {
          if (phase === 'leaving') setPhase('idle');
        }, TRANSITION_MS);
      }
    },
    [src, phase, reduced]
  );

  const commitGender = useCallback(
    (g) => {
      if (g === gender) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
      const next = resolveSrc(g, tagId);
      setGender(g);
      transitionTo(next, false);
    },
    [gender, tagId, resolveSrc, transitionTo]
  );

  const commitTag = useCallback(
    (t) => {
      if (t === tagId) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
      const next = resolveSrc(gender, t);
      setTagId(t);
      transitionTo(next, false);
    },
    [gender, tagId, resolveSrc, transitionTo]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const srcResolved = useMemo(() => src || '', [src]);

  const caption =
    gender && tagId
      ? 'A ' +
        (gender === 'male' ? 'male' : 'female') +
        ' shadow in the ' +
        (findById(tagId)?.label?.toLowerCase() || 'shadow') +
        ' circle'
      : 'Shadows take many forms';

  return (
    <div className="character-preview">
      <div className="character-preview__frame">
        <div className="character-preview__halo" aria-hidden="true" />
        {srcResolved && (
          <img
            ref={imgRef}
            src={srcResolved}
            alt={
              gender === 'male'
                ? 'Selected male vampire character'
                : 'Selected female vampire character'
            }
            className={
              'character-preview__figure ' +
              (phase === 'leaving'
                ? 'character-preview__figure--exit'
                : phase === 'entering'
                ? 'character-preview__figure--enter'
                : '')
            }
            loading="eager"
            decoding="async"
            draggable={false}
          />
        )}
        {oldSrc && (
          <img
            src={oldSrc}
            alt=""
            className="character-preview__figure character-preview__figure--old"
            loading="eager"
            decoding="async"
            draggable={false}
            aria-hidden="true"
          />
        )}
        {!srcResolved && (
          <div className="character-preview__placeholder" aria-hidden="true">
            <span className="character-preview__silhouette" aria-hidden="true" />
            <span className="character-preview__hint">Choose a form below</span>
          </div>
        )}
      </div>
      <p className="character-preview__caption">{caption}</p>
    </div>
  );
}
