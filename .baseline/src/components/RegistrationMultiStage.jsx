import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import RegistrationBats from './effects/RegistrationBats.jsx';
import RegistrationSmoke from './RegistrationSmoke.jsx';
import { GENDERS, DEPARTMENTS } from './RegistrationForm.jsx';
import { useTagConfig } from './TagSelector.jsx';
import { registrationAudio, enableAudio } from '../audio/registrationAudio.js';

/* ---------------------------------------------------------------- *
 * Five cinematic scenes, five different entrances, five different
 * exits. Each scene owns a named GSAP timeline that is killed before
 * the next one is built, so two scenes can never animate at once.
 * ---------------------------------------------------------------- */
const STAGE = { NAME: 0, DETAILS: 1, CHARACTER: 2, REVIEW: 3, SUCCESS: 4 };

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isCompact = () =>
  typeof window !== 'undefined' && window.innerWidth < 820;

const SRC = (gender, tag) =>
  gender && tag ? '/mafias-character-assets/' + gender + '-' + tag + '.png' : null;

/* Letter-by-letter heading. Each glyph is its own span so the stage
   timeline can stagger them, but the letters are grouped into non-breaking
   words: a line may only ever break between words, never between letters,
   so a heading can't leave one letter orphaned on its own line.
   Assistive tech reads the plain text instead of the glyph soup. */
function SplitText({ text, className }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      <span className="sr">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && <span className="reg-char reg-char--space"> </span>}
            <span className="reg-word">
              {Array.from(word).map((ch, i) => (
                <span key={i} className="reg-char">
                  {ch}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/* Character portrait with a real crossfade between the six assets. */
function CharacterFigure({ gender, tag, alt }) {
  const next = SRC(gender, tag);
  const [shown, setShown] = useState(next);
  const [prev, setPrev] = useState(null);
  const shownRef = useRef(next);

  useEffect(() => {
    if (next) {
      // decode before the swap so the crossfade never flashes an empty frame
      const img = new Image();
      img.src = next;
    }
    const cur = shownRef.current;
    if (!next) {
      shownRef.current = null;
      setShown(null);
      setPrev(null);
      return;
    }
    if (cur && cur !== next) setPrev(cur);
    shownRef.current = next;
    setShown(next);
  }, [next]);

  if (!shown) {
    return (
      // the only instruction lives in the caption below the portal
      <div className="reg-figure reg-figure--empty" aria-hidden="true">
        <span className="reg-figure__silhouette" />
      </div>
    );
  }

  return (
    <div className="reg-figure">
      {prev && prev !== shown && (
        <img key={prev} src={prev} alt="" aria-hidden="true" className="reg-figure__img reg-figure__img--out" draggable={false} />
      )}
      <img key={shown} src={shown} alt={alt} className="reg-figure__img reg-figure__img--in" draggable={false} />
    </div>
  );
}

export default function RegistrationMultiStage({ onBack, soundOn, onSoundToggle } = {}) {
  const { values: tags, findById } = useTagConfig();
  const reduced = useMemo(prefersReduced, []);
  const compact = useMemo(isCompact, []);

  /* Registration sounds controlled by SOUND toggle */
  const [sfxOn, setSfxOn] = useState(false);

  useEffect(() => {
    if (sfxOn) {
      enableAudio();
    } else {
      registrationAudio.setEnabled(false);
    }
  }, [sfxOn]);

  const toggleSfx = useCallback(async () => {
    const next = !sfxOn;
    if (next) {
      const ok = await enableAudio();
      if (ok) {
        setSfxOn(true);
        registrationAudio.playSelection('gender');
      } else {
        setSfxOn(false);
      }
    } else {
      setSfxOn(false);
      registrationAudio.setEnabled(false);
    }
    if (typeof onSoundToggle === 'function') onSoundToggle(next && sfxOn);
  }, [sfxOn, onSoundToggle]);

  const [stage, setStage] = useState(STAGE.NAME);
  const [form, setForm] = useState({ name: '', department: '', contact: '', gender: '', tag: '' });
  const [touched, setTouched] = useState({ name: false, contact: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [batsBurst, setBatsBurst] = useState(false);

  const rigRef = useRef(null);       // camera rig — moves per scene
  const orbitRef = useRef(null);     // idle drift — separate so it never fights the dive
  const stageEl = useRef(null);      // the mounted scene
  const veilRef = useRef(null);      // red smoke curtain between scenes
  const flashRef = useRef(null);     // light flash used by the submission
  const tlRef = useRef(null);        // the ONE running timeline
  const driftRef = useRef(null);     // ambient loop of the current scene
  const animating = useRef(false);
  const abortRef = useRef(null);
  const submitLock = useRef(false);

  const trim = useCallback((v) => (typeof v === 'string' ? v.replace(/^\s+|\s+$/g, '') : v), []);

  const validateName = useCallback(
    (raw) => {
      const v = trim(raw);
      if (!v) return 'Full name is required';
      if (v.length < 2) return 'Enter your full name';
      if (!/[A-Za-z]/.test(v)) return 'Use letters in your full name';
      return null;
    },
    [trim]
  );

  const validateContact = useCallback((raw) => {
    if (!raw) return 'Contact number is required';
    // the field invites "+91 98765 43210", so spacing and dashes must not count
    const cleaned = String(raw).replace(/[\s\-()]/g, '');
    if (!/^(\+?91)?\d{10}$/.test(cleaned)) {
      return 'Use an Indian mobile number, with or without +91';
    }
    return null;
  }, []);

  const nameError = touched.name ? validateName(form.name) : null;
  const contactError = touched.contact ? validateContact(form.contact) : null;

  const selectedTag = findById(form.tag);
  const accent = selectedTag?.accent || '#E12A45';

  /* ---------------- scene timelines ---------------- */
  const stopAll = useCallback(() => {
    tlRef.current?.kill();
    tlRef.current = null;
    driftRef.current?.kill();
    driftRef.current = null;
    gsap.killTweensOf(rigRef.current);
    gsap.killTweensOf(orbitRef.current);
  }, []);

  /* ENTER — every scene starts from a different camera pose and reveals
     its own content in its own order. */
  const buildEnter = useCallback(
    (which, el) => {
      const $ = (sel) => el.querySelector(sel);
      const $$ = (sel) => Array.from(el.querySelectorAll(sel));
      const rig = rigRef.current;
      const orbit = orbitRef.current;
      const speed = reduced ? 1.9 : 1;

      gsap.set(rig, { x: 0, y: 0, z: 0, rotateY: 0, rotateX: 0, scale: 1 });
      gsap.set(orbit, { rotateY: 0, x: 0, y: 0 });

      const tl = gsap.timeline({
        onComplete: () => {
          animating.current = false;
        },
      });

      /* the smoke curtain of the previous exit lifts */
      if (veilRef.current) {
        tl.to(veilRef.current, { opacity: 0, duration: 0.7 / speed, ease: 'power2.out' }, 0);
      }

      if (which === STAGE.NAME) {
        /* 01 — forward dolly, light rising, letters emerging, input floating up */
        const chars = $$('.reg-char');
        const lamp = $('.reg-stage__lamp');
        gsap.set(rig, { z: -280 });
        gsap.set(chars, { opacity: 0, y: 22, filter: 'blur(10px)' });
        gsap.set(lamp, { opacity: 0 });
        tl.to(rig, { z: 0, duration: 1.2 / speed, ease: 'power3.out' }, 0)
          .to(lamp, { opacity: 1, duration: 1.0 / speed, ease: 'sine.out' }, 0.1)
          .to(chars, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65 / speed, stagger: 0.024 / speed, ease: 'power2.out' }, 0.3)
          .fromTo($('.reg-stage__sub'),
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.5 / speed, ease: 'power2.out' }, 0.85)
          .fromTo($('.reg-name-field'),
            { opacity: 0, y: 42, filter: 'blur(8px)' },
            { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8 / speed, ease: 'power3.out' }, 1.05)
          .fromTo($('.reg-stage__cta'),
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.5 / speed, ease: 'power2.out' }, 1.55);
      }

      if (which === STAGE.DETAILS) {
        /* 02 — sideways dolly, panel sweeping in from the right, fields in sequence */
        gsap.set(rig, { x: 210, z: -150, rotateY: 16 });
        tl.to(rig, { x: 0, z: 0, rotateY: 0, duration: 1.05 / speed, ease: 'power3.out' }, 0)
          .fromTo($('.reg-panel'),
            { opacity: 0, x: 150, rotateY: -14, transformOrigin: 'left center' },
            { opacity: 1, x: 0, rotateY: 0, duration: 0.9 / speed, ease: 'power3.out' }, 0.05)
          .fromTo($('.reg-field--dept'),
            { opacity: 0, x: 46 },
            { opacity: 1, x: 0, duration: 0.55 / speed, ease: 'power2.out' }, 0.42)
          .fromTo($('.reg-field--contact'),
            { opacity: 0, x: 46 },
            { opacity: 1, x: 0, duration: 0.55 / speed, ease: 'power2.out' }, 0.66)
          .fromTo($('.reg-stage__cta'),
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.45 / speed, ease: 'power2.out' }, 0.95);
      }

      if (which === STAGE.CHARACTER) {
        /* 03 — the portal opens, options stagger, the figure burns out of silhouette */
        gsap.set(rig, { z: -190, rotateY: -8 });
        tl.to(rig, { z: 0, rotateY: 0, duration: 1.2 / speed, ease: 'power3.out' }, 0)
          .fromTo($('.reg-portal'),
            { opacity: 0, scale: 0.6 },
            { opacity: 1, scale: 1, duration: 1.1 / speed, ease: 'power2.out' }, 0)
          .fromTo($$('.reg-opt-group--gender .reg-option'),
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5 / speed, stagger: 0.07 / speed, ease: 'power2.out' }, 0.45)
          .fromTo($$('.reg-opt-group--tag .reg-option'),
            { opacity: 0, y: 20, scale: 0.92 },
            { opacity: 1, y: 0, scale: 1, duration: 0.5 / speed, stagger: 0.06 / speed, ease: 'power2.out' }, 0.72)
          .fromTo($('.reg-portal__figure'),
            { opacity: 0, filter: 'brightness(0) blur(12px)' },
            { opacity: 1, filter: 'brightness(1) blur(0px)', duration: 1.15 / speed, ease: 'power2.out' }, 0.85)
          .fromTo($('.reg-stage__cta'),
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.45 / speed, ease: 'power2.out' }, 1.25);

        // slow orbit around the figure — its own loop, so the camera tweens
        // of the next exit can still kill it outright
        if (!reduced && orbit) {
          driftRef.current = gsap.to(orbit, {
            rotateY: 5,
            x: 14,
            duration: 9,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          });
        }
      }

      if (which === STAGE.REVIEW) {
        /* 04 — camera settles, summary rows rise one after another */
        gsap.set(rig, { z: -130 });
        tl.to(rig, { z: 0, duration: 1.0 / speed, ease: 'power3.out' }, 0)
          .fromTo($('.reg-summary'),
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.7 / speed, ease: 'power2.out' }, 0.15)
          .fromTo($$('.reg-summary__row'),
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5 / speed, stagger: 0.08 / speed, ease: 'power2.out' }, 0.3)
          .fromTo($('.reg-review__figure'),
            { opacity: 0, scale: 0.94, filter: 'brightness(0.4) blur(6px)' },
            { opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)', duration: 0.8 / speed, ease: 'power2.out' }, 0.35)
          .fromTo($$('.reg-stage__actions .reg-stage__cta'),
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.5 / speed, stagger: 0.08 / speed, ease: 'power2.out' }, 0.9);
      }

      if (which === STAGE.SUCCESS) {
        /* 05 — the camera pulls back and the title lands letter by letter */
        const chars = $$('.reg-char');
        gsap.set(rig, { z: 230, scale: 1.1 });
        gsap.set(chars, { opacity: 0, y: 18, filter: 'blur(12px)' });
        tl.to(rig, { z: 0, scale: 1, duration: 1.5 / speed, ease: 'power2.out' }, 0)
          .to(chars, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 / speed, stagger: 0.03 / speed, ease: 'power2.out' }, 0.35)
          .fromTo($('.reg-stage__sub'),
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.8 / speed, ease: 'power2.out' }, 0.9)
          .fromTo($('.reg-stage__cta'),
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.6 / speed, ease: 'power2.out' }, 1.3);
      }

      return tl;
    },
    [reduced]
  );

  /* EXIT — each scene leaves in its own direction, behind its own smoke. */
  const buildExit = useCallback(
    (which, el, next) => {
      const $ = (sel) => el.querySelector(sel);
      const $$ = (sel) => Array.from(el.querySelectorAll(sel));
      const rig = rigRef.current;
      const veil = veilRef.current;
      const speed = reduced ? 1.9 : 1;
      const veilIn = veil ? 0.55 / speed : 0;

      const tl = gsap.timeline({
        onComplete: () => {
          setStage(next);
        },
      });

      if (which === STAGE.NAME) {
        /* the name floats forward and the fog swallows the scene */
        tl.to(rig, { z: 190, duration: 0.75 / speed, ease: 'power2.in' }, 0)
          .to($$('.reg-char'), { opacity: 0, y: -14, filter: 'blur(8px)', duration: 0.32 / speed, stagger: 0.012 / speed }, 0)
          .to($('.reg-name-field'), { y: -46, opacity: 0, scale: 1.06, duration: 0.45 / speed, ease: 'power2.in' }, 0)
          .to($('.reg-stage__sub'), { opacity: 0, duration: 0.3 / speed }, 0)
          .to($('.reg-stage__cta'), { opacity: 0, y: -10, duration: 0.3 / speed }, 0);
      }

      if (which === STAGE.DETAILS) {
        /* rotate away, panel slides out in depth, embers trail the camera */
        tl.to(rig, { x: -190, rotateY: -12, z: -70, duration: 0.75 / speed, ease: 'power2.in' }, 0)
          .to($('.reg-panel'), { x: -150, rotateY: 12, opacity: 0, duration: 0.55 / speed, ease: 'power2.in' }, 0)
          .to($('.reg-stage__cta'), { opacity: 0, duration: 0.3 / speed }, 0)
          .fromTo(
            $$('.reg-trail__dot'),
            { opacity: 0, x: 0, y: 0, scale: 0.4 },
            { opacity: 0.9, x: -120, y: '-=40', scale: 1, duration: 0.7 / speed, stagger: 0.04, ease: 'power1.out' },
            0.1
          );
      }

      if (which === STAGE.CHARACTER) {
        /* the portal flares, the camera walks into the figure, smoke expands */
        tl.to($('.reg-portal'), { scale: 1.3, filter: 'brightness(1.7)', duration: 0.6 / speed, ease: 'power2.in' }, 0)
          .to(rig, { z: 160, duration: 0.8 / speed, ease: 'power2.in' }, 0)
          .to($('.reg-portal__figure'), { scale: 1.05, filter: 'brightness(1.35)', duration: 0.6 / speed }, 0)
          .to($('.reg-identity'), { opacity: 0, y: -18, duration: 0.4 / speed }, 0)
          .to($('.reg-stage__cta'), { opacity: 0, duration: 0.3 / speed }, 0);
      }

      if (which === STAGE.REVIEW) {
        /* only used for BACK: the summary lifts away */
        tl.to(rig, { z: -110, duration: 0.6 / speed, ease: 'power2.in' }, 0)
          .to($('.reg-summary'), { opacity: 0, y: -22, duration: 0.4 / speed }, 0)
          .to($('.reg-review__figure'), { opacity: 0, scale: 0.96, duration: 0.4 / speed }, 0)
          .to($$('.reg-stage__actions .reg-stage__cta'), { opacity: 0, duration: 0.3 / speed }, 0);
      }

      if (veil) tl.to(veil, { opacity: 1, duration: veilIn, ease: 'power2.in' }, 0.12);

      return tl;
    },
    [reduced]
  );

  /* ---- mount / swap the scene ---- */
  useEffect(() => {
    const el = stageEl.current;
    if (!el) return undefined;

    stopAll();
    animating.current = true;

    const tl = buildEnter(stage, el);
    tlRef.current = tl;

    /* Cinematic audio synchronized with animations */
    if (stage === STAGE.CHARACTER) {
      registrationAudio.playPortal();
      setTimeout(() => registrationAudio.playCharacterReveal(), 800);
    }
    if (stage === STAGE.SUCCESS) {
      registrationAudio.playSuccess();
    }

    return () => {
      tl.kill();
      driftRef.current?.kill();
      driftRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    return () => {
      stopAll();
      registrationAudio.stopAll();
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  /* One gate for every navigation: if a scene is still animating we finish
     it instantly instead of stacking a second timeline on top of it. */
  const goTo = useCallback(
    (next) => {
      const el = stageEl.current;
      if (!el) {
        setStage(next);
        return;
      }
      if (animating.current && tlRef.current) tlRef.current.progress(1);
      // Play appropriate transition sound based on direction and specific transition
      if (next < stage) {
        registrationAudio.playTransition('reverse-transition');
      } else {
        if (stage === STAGE.NAME && next === STAGE.DETAILS) {
          registrationAudio.playTransition('name-to-details');
        } else if (stage === STAGE.DETAILS && next === STAGE.CHARACTER) {
          registrationAudio.playTransition('details-to-character');
        } else if (stage === STAGE.CHARACTER && next === STAGE.REVIEW) {
          registrationAudio.playTransition('character-to-review');
        } else {
          registrationAudio.playTransition('name-to-details');
        }
      }
      animating.current = true;
      stopAll();
      tlRef.current = buildExit(stage, el, next);
    },
    [stage, buildExit, stopAll]
  );

  const leave = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else if (typeof window !== 'undefined') window.location.href = '/';
  }, [onBack]);

  const nextFromName = useCallback(async () => {
    if (!sfxOn) {
      const ok = await enableAudio();
      if (ok) setSfxOn(true);
    }
    registrationAudio.playTransition('name-to-details');
    const v = trim(form.name);
    if (validateName(v)) {
      setTouched((t) => ({ ...t, name: true }));
      return;
    }
    setForm((f) => ({ ...f, name: v }));
    setSubmitError(null);
    goTo(STAGE.DETAILS);
  }, [form.name, trim, validateName, goTo, sfxOn]);

  const nextFromDetails = useCallback(() => {
    if (!form.department) {
      setSubmitError('Choose a department');
      return;
    }
    const cv = trim(form.contact);
    if (validateContact(cv)) {
      setTouched((t) => ({ ...t, contact: true }));
      return;
    }
    setForm((f) => ({ ...f, contact: cv }));
    setSubmitError(null);
    goTo(STAGE.CHARACTER);
  }, [form.department, form.contact, trim, validateContact, goTo]);

  const nextFromCharacter = useCallback(() => {
    if (!form.gender) {
      setSubmitError('Choose a character form');
      return;
    }
    if (!form.tag) {
      setSubmitError('Choose a college tag');
      return;
    }
    setSubmitError(null);
    goTo(STAGE.REVIEW);
  }, [form.gender, form.tag, goTo]);

  const back = useCallback(() => {
    if (stage === STAGE.NAME) {
      leave();
      return;
    }
    if (submitting) return;
    goTo(stage - 1);
  }, [stage, submitting, leave, goTo]);

  /* ---- submission: flash, smoke, bats, then the real backend call ---- */
  const handleSubmit = useCallback(() => {
    if (submitting || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setBatsBurst(true);

    const el = stageEl.current;
    const speed = reduced ? 1.8 : 1;

    if (animating.current && tlRef.current) tlRef.current.progress(1);
    tlRef.current?.kill();
    registrationAudio.playSubmission();
    const cinematic = gsap.timeline();
    if (el) {
      cinematic
        .to(el.querySelector('.reg-summary'), { scale: 1.01, duration: 0.5 / speed }, 0)
        .to(el.querySelector('.reg-review__figure'), {
          filter: 'brightness(1.45) drop-shadow(0 0 44px rgba(225,42,69,.75))',
          scale: 1.04,
          duration: 0.6 / speed,
          ease: 'power2.out',
        }, 0)
        .to(rigRef.current, { z: 120, duration: 0.9 / speed, ease: 'power2.inOut' }, 0.1);
    }
    if (flashRef.current) {
      cinematic
        .to(flashRef.current, { opacity: 0.85, duration: 0.12 }, 0.55)
        .to(flashRef.current, { opacity: 0, duration: 0.55 }, 0.7);
    }
    tlRef.current = cinematic;

    const body = {
      fullName: form.name,
      department: form.department,
      contact: form.contact,
      gender: form.gender,
      tag: form.tag,
    };

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timestamp: new Date().toISOString() }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          // a failed request is not always JSON — never surface a parser error
          return res.text().then((raw) => {
            let message = 'Registration could not be completed';
            try {
              const data = JSON.parse(raw);
              if (data && data.message) message = data.message;
            } catch (e) {}
            throw new Error(message);
          });
        }
        return res.json().catch(() => ({}));
      })
      .then(() => {
        abortRef.current = null;
        setTimeout(() => {
          setBatsBurst(false);
          setStage(STAGE.SUCCESS);
        }, reduced ? 200 : 900);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        abortRef.current = null;
        submitLock.current = false;
        // the cinematic push must stop before the rollback, or it keeps
        // writing the pushed-in camera pose over it
        tlRef.current?.kill();
        tlRef.current = null;
        // nothing fake is shown: the review scene comes back exactly as it was
        tween_back();
        setBatsBurst(false);
        setSubmitError(err?.message || 'Registration could not be completed');
        setSubmitting(false);
      });

    function tween_back() {
      if (el) {
        gsap.to(el.querySelector('.reg-summary'), { scale: 1, duration: 0.4 });
        gsap.to(el.querySelector('.reg-review__figure'), {
          filter: 'none',
          scale: 1,
          duration: 0.4,
        });
      }
      gsap.to(rigRef.current, { z: 0, duration: 0.5 });
    }
  }, [form, submitting, reduced]);

  const handleBackdrop = useCallback(
    (e) => {
      e.preventDefault();
      leave();
    },
    [leave]
  );

  const tagOptions = tags;
  const genderOptions = Object.values(GENDERS);
  const selectedDept = DEPARTMENTS.find((d) => d.id === form.department);
  const selectedGender = GENDERS[form.gender];

  const enableOnFirstClick = useCallback(async () => {
    if (!sfxOn) {
      const ok = await enableAudio();
      if (ok) setSfxOn(true);
    }
  }, [sfxOn]);

  return (
    <div className="reg-scene" style={{ '--reg-accent': accent }} onClick={enableOnFirstClick} onTouchStart={enableOnFirstClick}>
      {/* atmosphere — behind every scene, continuous across the journey */}
      <RegistrationBats />
      <RegistrationSmoke className="registration-smoke" />
      <RegistrationSmoke className="registration-smoke registration-smoke--extra" />
      <div className="registration-fog" aria-hidden="true" />
      <div className="registration-embers" aria-hidden="true">
        {[...Array(compact ? 6 : 12)].map((_, i) => (
          <span
            key={i}
            className="registration-ember"
            style={{ '--i': i, left: (i * 8.3) % 100 + '%', animationDelay: i * 0.7 + 's' }}
          />
        ))}
      </div>

      <header className="registration-topbar registration-topbar--entered">
        <button className="registration-topbar__back" onClick={back} type="button" aria-label="Go back">
          <span className="registration-topbar__back-mark" aria-hidden="true" />
          <span className="registration-topbar__back-label">{stage === STAGE.NAME ? 'RETURN TO MAFIAS' : 'BACK'}</span>
        </button>
        <button type="button" className="registration-topbar__mark" onClick={handleBackdrop}>
          MΛFIΛS
        </button>
        <span className="registration-topbar__spacer" aria-hidden="true" />
        <button
          type="button"
          className={'sound registration-topbar__sound' + (sfxOn ? ' on' : '')}
          onClick={toggleSfx}
          aria-pressed={sfxOn}
          aria-label={sfxOn ? 'Turn registration sound off' : 'Turn registration sound on'}
        >
          <span className="bars">
            <i />
            <i />
            <i />
            <i />
          </span>
          SOUND {sfxOn ? 'ON' : 'OFF'}
        </button>
        <span className="registration-topbar__tag">
          {stage === STAGE.SUCCESS ? 'CEG · GUINDY' : `0${stage + 1} / 05`}
        </span>
      </header>

      <div className="reg-viewport">
        <div className="reg-rig" ref={rigRef}>
          <div className="reg-orbit" ref={orbitRef}>
            {/* ---------------- 01 · CLAIM YOUR PLACE ---------------- */}
            {stage === STAGE.NAME && (
              <section className="reg-stage" ref={stageEl} data-stage="name">
                <span className="reg-stage__lamp" aria-hidden="true" />
                <p className="reg-stage__eyebrow">
                  <span aria-hidden="true" /> THE INNER CIRCLE <span aria-hidden="true" />
                </p>
                <h1 className="reg-stage__heading">
                  <SplitText text="CLAIM YOUR PLACE" />
                </h1>
                <p className="reg-stage__sub">Every story begins with a name.</p>
                <div className="reg-name-field">
                  <label className="reg-label" htmlFor="reg-name">Full name</label>
                  <input
                    id="reg-name"
                    className="reg-input reg-input--hero"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    placeholder="Your name, as it will be remembered"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name: e.target.value }));
                      if (touched.name) setTouched((t) => ({ ...t, name: false }));
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') nextFromName();
                    }}
                  />
                  {nameError && <p className="reg-error" role="alert">{nameError}</p>}
                </div>
                <button className="reg-stage__cta" type="button" onClick={nextFromName}>
                  CONTINUE <b aria-hidden="true">→</b>
                </button>
              </section>
            )}

            {/* ---------------- 02 · IDENTIFY YOURSELF ---------------- */}
            {stage === STAGE.DETAILS && (
              <section className="reg-stage" ref={stageEl} data-stage="details">
                <div className="reg-panel">
                  <span className="reg-panel__sheen" aria-hidden="true" />
                  <p className="reg-stage__eyebrow">
                    <span aria-hidden="true" /> THE INNER CIRCLE <span aria-hidden="true" />
                  </p>
                  <h1 className="reg-stage__heading reg-stage__heading--md">
                    <SplitText text="IDENTIFY YOURSELF" />
                  </h1>
                  <p className="reg-stage__sub">Tell us where you belong.</p>

                  <div className="reg-field reg-field--dept">
                    <label className="reg-label" htmlFor="reg-dept">Department</label>
                    <select
                      id="reg-dept"
                      className="reg-input reg-select"
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    >
                      <option value="">Select department</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="reg-field reg-field--contact">
                    <label className="reg-label" htmlFor="reg-contact">Contact number</label>
                    <input
                      id="reg-contact"
                      className="reg-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      value={form.contact}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, contact: e.target.value }));
                        if (touched.contact) setTouched((t) => ({ ...t, contact: false }));
                      }}
                      onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') nextFromDetails();
                      }}
                    />
                    {contactError && <p className="reg-error" role="alert">{contactError}</p>}
                  </div>

                  {submitError && <p className="reg-error" role="alert">{submitError}</p>}

                  <button className="reg-stage__cta" type="button" onClick={nextFromDetails}>
                    CONTINUE <b aria-hidden="true">→</b>
                  </button>
                </div>
                <div className="reg-trail" aria-hidden="true">
                  {[...Array(compact ? 4 : 8)].map((_, i) => (
                    <span key={i} className="reg-trail__dot" style={{ '--i': i }} />
                  ))}
                </div>
              </section>
            )}

            {/* ---------------- 03 · CHOOSE YOUR IDENTITY ---------------- */}
            {stage === STAGE.CHARACTER && (
              <section className="reg-stage reg-stage--character" ref={stageEl} data-stage="character">
                <div className="reg-identity">
                  <p className="reg-stage__eyebrow">
                    <span aria-hidden="true" /> THE INNER CIRCLE <span aria-hidden="true" />
                  </p>
                  <h1 className="reg-stage__heading reg-stage__heading--sm">
                    <SplitText text="CHOOSE YOUR IDENTITY" />
                  </h1>

                  <fieldset className="reg-opt-group reg-opt-group--gender">
                    <legend className="reg-label">Gender</legend>
                    <div className="reg-options">
                      {genderOptions.map((g) => (
                        <label key={g.id} className={form.gender === g.id ? 'reg-option reg-option--on' : 'reg-option'}>
                          <input
                            type="radio"
                            name="gender"
                            value={g.id}
                            checked={form.gender === g.id}
                            onChange={() => {
                              setForm((f) => ({ ...f, gender: g.id }));
                              setSubmitError(null);
                              registrationAudio.playSelection('gender');
                            }}
                          />
                          <span className="reg-option__label">{g.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="reg-opt-group reg-opt-group--tag">
                    <legend className="reg-label">College tag</legend>
                    <div className="reg-options">
                      {tagOptions.map((t) => (
                        <label
                          key={t.id}
                          className={form.tag === t.id ? 'reg-option reg-option--on' : 'reg-option'}
                          style={{ '--tag': t.accent }}
                        >
                          <input
                            type="radio"
                            name="tag"
                            value={t.id}
                            checked={form.tag === t.id}
                            onChange={() => {
                              setForm((f) => ({ ...f, tag: t.id }));
                              setSubmitError(null);
                              registrationAudio.playTag(t.id);
                            }}
                          />
                          <span className="reg-option__swatch" style={{ background: t.accent }} aria-hidden="true" />
                          <span className="reg-option__label">{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {submitError && <p className="reg-error" role="alert">{submitError}</p>}

                  <button className="reg-stage__cta" type="button" onClick={nextFromCharacter}>
                    CONTINUE <b aria-hidden="true">→</b>
                  </button>
                </div>

                {/* portal and portrait share one container, so the rings stay
                    concentric with the character at every viewport width */}
                <div className="reg-preview">
                  <div className="reg-preview__stage">
                    <div className="reg-portal" aria-hidden="true">
                      <span className="reg-portal__ring reg-portal__ring--a" />
                      <span className="reg-portal__ring reg-portal__ring--b" />
                      <span className="reg-portal__ring reg-portal__ring--c" />
                      <span className="reg-portal__core" />
                    </div>
                    <div className="reg-portal__figure">
                      <CharacterFigure
                        gender={form.gender}
                        tag={form.tag}
                        alt={form.gender === 'female' ? 'Selected female character' : 'Selected male character'}
                      />
                    </div>
                  </div>
                  <p className="reg-portal__caption">
                    {form.gender && form.tag
                      ? `${form.gender === 'female' ? 'Female' : 'Male'} · ${selectedTag?.label} tag`
                      : 'Choose a form to be revealed'}
                  </p>
                </div>
              </section>
            )}

            {/* ---------------- 04 · YOUR PLACE AWAITS ---------------- */}
            {stage === STAGE.REVIEW && (
              <section className="reg-stage reg-stage--review" ref={stageEl} data-stage="review">
                <div className="reg-review__figure">
                  <CharacterFigure
                    gender={form.gender}
                    tag={form.tag}
                    alt={form.gender === 'female' ? 'Your selected female character' : 'Your selected male character'}
                  />
                </div>

                <div className="reg-review__body">
                  <p className="reg-stage__eyebrow">
                    <span aria-hidden="true" /> THE INNER CIRCLE <span aria-hidden="true" />
                  </p>
                  <h1 className="reg-stage__heading reg-stage__heading--md">
                    <SplitText text="YOUR PLACE AWAITS" />
                  </h1>

                  <dl className="reg-summary">
                    <div className="reg-summary__row">
                      <dt>Name</dt>
                      <dd className="reg-summary__name">{form.name}</dd>
                    </div>
                    <div className="reg-summary__row">
                      <dt>Department</dt>
                      <dd>{selectedDept?.label || '—'}</dd>
                    </div>
                    <div className="reg-summary__row">
                      <dt>Contact</dt>
                      <dd>{form.contact || '—'}</dd>
                    </div>
                    <div className="reg-summary__row">
                      <dt>Gender</dt>
                      <dd>{selectedGender?.label || '—'}</dd>
                    </div>
                    <div className="reg-summary__row">
                      <dt>College tag</dt>
                      <dd>{selectedTag?.label || '—'}</dd>
                    </div>
                  </dl>

                  {submitError && (
                    <div className="reg-error reg-error--block" role="alert">
                      {submitError}
                      <button type="button" className="reg-retry" onClick={handleSubmit} disabled={submitting}>
                        TRY AGAIN
                      </button>
                    </div>
                  )}

                  <div className="reg-stage__actions">
                    <button
                      className="reg-stage__cta reg-stage__cta--ghost"
                      type="button"
                      onClick={back}
                      disabled={submitting}
                    >
                      BACK
                    </button>
                    <button
                      className="reg-stage__cta"
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      aria-busy={submitting}
                    >
                      {submitting ? 'REGISTERING…' : 'SUBMIT REGISTRATION'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* ---------------- 05 · WELCOME TO MAFIAS ---------------- */}
            {stage === STAGE.SUCCESS && (
              <section className="reg-stage reg-stage--success" ref={stageEl} data-stage="success">
                <span className="reg-stage__lamp reg-stage__lamp--success" aria-hidden="true" />
                <div className="reg-success__figure">
                  <CharacterFigure
                    gender={form.gender}
                    tag={form.tag}
                    alt={form.gender === 'female' ? 'Your female character' : 'Your male character'}
                  />
                </div>
                <h1 className="reg-stage__heading reg-stage__heading--success">
                  <SplitText text="WELCOME TO MAFIAS" />
                </h1>
                <p className="reg-stage__sub">Your place in the shadows is secured.</p>
                <div className="reg-stage__actions">
                  <button className="reg-stage__cta" type="button" onClick={leave}>
                    RETURN TO MAFIAS
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* transition + submission light */}
      <div className="reg-veil" ref={veilRef} aria-hidden="true" />
      <div className="reg-flash" ref={flashRef} aria-hidden="true" />

      {batsBurst && (
        <div className="reg-bats-burst" aria-hidden="true">
          {[...Array(compact ? 4 : 8)].map((_, i) => (
            <span key={i} className="reg-bat-fly" style={{ '--i': i, animationDelay: i * 0.07 + 's' }}>
              <svg viewBox="0 0 120 60" width="84" height="42">
                <path d="M60 30 L30 18 L48 22 L22 12 L50 24 L78 24 L62 36 L44 34 Z" fill="#050509" stroke="#020204" strokeWidth="1.2" />
                <path d="M60 30 L90 18 L72 22 L98 12 L70 24 L42 24 L58 36 L76 34 Z" fill="#050509" stroke="#020204" strokeWidth="1.2" />
                <ellipse cx="60" cy="32" rx="5" ry="7" fill="#050509" />
              </svg>
            </span>
          ))}
        </div>
      )}

      <footer className="registration-foot">
        <span>MAFIAS • CEG</span>
        <span>{stage === STAGE.SUCCESS ? 'THE INNER CIRCLE' : 'JOIN THE SHADOWS'}</span>
      </footer>
    </div>
  );
}
