import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTagConfig } from './TagSelector.jsx';


export const GENDERS = {
  male: { id: 'male', label: 'Male' },
  female: { id: 'female', label: 'Female' },
};

export const TAG_CONFIG = {
  red: { id: 'red', label: 'Red', accent: '#B81735' },
  brown: { id: 'brown', label: 'Brown', accent: '#795039' },
  orange: { id: 'orange', label: 'Orange', accent: '#CF6B25' },
};

export const DEPARTMENTS = [
  { id: 'ce', label: 'Civil Engineering' },
  { id: 'cse', label: 'Computer Science & Engineering' },
  { id: 'eee', label: 'Electrical & Electronics Engineering' },
  { id: 'ece', label: 'Electronics & Communication Engineering' },
  { id: 'me', label: 'Mechanical Engineering' },
  { id: 'chi', label: 'Chemical Engineering' },
  { id: 'agt', label: 'Agri Tech' },
  { id: 'it', label: 'Information Technology' },
  { id: 'ds', label: 'Data Science' },
  { id: 'aiml', label: 'AI & ML' },
  { id: 'dsa', label: 'Data Analytics' },
  { id: 'aim', label: 'AI & Mathematics' },
];

const GENDER_ORDER = ['male', 'female'];

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  required = false,
  inputProps = {},
  id,
}) {
  return (
    <div className="reg-field">
      <label className="reg-field__label" htmlFor={id || name}>
        {label}
        {required && <span className="reg-field__req" aria-hidden="true"> *</span>}
      </label>
      {type === 'select' ? (
        <select
          id={id || name}
          name={name}
          className="reg-field__input reg-field__select"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          {...inputProps}
        >
          <option value="">Select department</option>
        </select>
      ) : (
        <input
          id={id || name}
          name={name}
          type={type}
          className="reg-field__input"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          {...inputProps}
        />
      )}
      {error !== undefined && error !== null && (
        <p className="reg-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function RadioGroup({ name, label, options, value, onChange, required = false, disabled }) {
  return (
    <fieldset className="reg-group">
      <legend className="reg-group__legend">
        {label}
        {required && <span className="reg-field__req" aria-hidden="true"> *</span>}
      </legend>
      <div className="reg-options" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <label key={opt.id} className="reg-option">
            <input
              type="radio"
              name={name}
              value={opt.id}
              checked={value === opt.id}
              onChange={() => onChange(opt.id)}
              className="reg-option__input"
              disabled={disabled}
              aria-checked={value === opt.id}
            />
            {opt.swatch ? (
              <span
                className="reg-option__swatch"
                style={{ backgroundColor: opt.swatch }}
                aria-hidden="true"
              />
            ) : null}
            <span className="reg-option__label">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function RegistrationForm() {
  const navigate = useNavigate();
  const { values: tags, findById: findTag } = useTagConfig();
  const reduced = useMemo(() => prefersReduced(), []);

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [contact, setContact] = useState('');
  const [gender, setGender] = useState('');
  const [tag, setTag] = useState('');

  const [nameTouched, setNameTouched] = useState(false);
  const [contactTouched, setContactTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitMessage, setSubmitMessage] = useState(null);
  
  const abortRef = useRef(null);

  const trim = useCallback(
    (v) => (typeof v === 'string' ? v.replace(/^\s+|\s+$/g, '') : v),
    []
  );

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
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (!/^((\+91|91)?\d{10})$/.test(raw.trim()) && digits.length !== 10) {
      return 'Use an Indian mobile number, with or without +91';
    }
    return null;
  }, []);

  const nameError = nameTouched ? validateName(name) : null;
  const contactError = contactTouched ? validateContact(contact) : null;

  const updateName = (e) => {
    setName(e.target.value);
    if (nameTouched) setNameTouched(false);
  };

  const updateContact = (e) => {
    setContact(e.target.value);
    if (contactTouched) setContactTouched(false);
  };

  const startSubmit = useCallback(() => {
    const nv = trim(name);
    const cv = trim(contact);

    if (validateName(nv)) {
      setNameTouched(true);
      return;
    }
    if (!department) {
      setSubmitError('Choose a department');
      return;
    }
    if (validateContact(cv)) {
      setContactTouched(true);
      return;
    }
    if (!gender) {
      setSubmitError('Choose a character form');
      return;
    }
    if (!tag) {
      setSubmitError('Choose a college tag');
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    setPending(true);
    setSubmitError(null);
    setSubmitMessage(null);

    const body = {
      fullName: nv,
      department,
      contact: cv,
      gender,
      tag,
    };

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timestamp = new Date().toISOString();

    fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timestamp }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error(data?.message || 'Registration could not be completed');
          });
        }
        return res.json();
      })
      .then((data) => {
        setSubmitMessage(data?.message || 'You have been registered');
        setPending(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSubmitError(err?.message || 'Registration could not be completed');
        setPending(false);
      })
      .finally(() => {
        setSubmitting(false);
        abortRef.current = null;
      });
  }, [
    name,
    department,
    contact,
    gender,
    tag,
    validateName,
    validateContact,
    submitting,
    trim,
  ]);

  const handleGender = useCallback(
    (id) => {
      setGender(id);
      setNameTouched(false);
      setContactTouched(false);
    },
    [setGender, setNameTouched, setContactTouched]
  );

  const handleTag = useCallback(
    (id) => {
      setTag(id);
      setNameTouched(false);
      setContactTouched(false);
    },
    [setTag, setNameTouched, setContactTouched]
  );

  const handleBack = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setPending(false);
    setSubmitting(false);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const radioOptions = GENDER_ORDER.map((id) => ({
    id,
    label: GENDERS[id].label,
  }));

  const tagOptions = tags.map((t) => ({
    id: t.id,
    label: t.label,
    swatch: t.accent,
  }));

  const handleDepartmentChange = useCallback(
    (value) => {
      setDepartment(value);
      setNameTouched(false);
    },
    [setDepartment, setNameTouched]
  );

  const handleContactBlur = useCallback(() => {
    setContactTouched(true);
  }, [setContactTouched]);

  const handleNameBlur = useCallback(() => {
    setNameTouched(true);
  }, [setNameTouched]);

  const handleDepartmentBlur = useCallback(() => {
    // no-op
  }, []);

  return (
    <form
      className="registration-form"
      onSubmit={(e) => {
        e.preventDefault();
        startSubmit();
      }}
      noValidate
      aria-label="Mafias registration form"
    >
      <Field
        label="Full Name"
        name="fullName"
        type="text"
        id="reg-name"
        value={name}
        onChange={updateName}
        onBlur={() => setNameTouched(true)}
        error={nameError}
        required
        autoComplete="name"
        inputProps={{
          placeholder: 'Your full name',
          inputMode: 'text',
          disabled: submitting || pending,
        }}
      />      <div className="reg-field">
        <label className="reg-field__label" htmlFor="reg-dept">
          Department
          <span className="reg-field__req" aria-hidden="true"> *</span>
        </label>
        <select
          id="reg-dept"
          name="department"
          className="reg-field__input reg-field__select"
          value={department}
          onChange={handleDepartmentChange}
          onBlur={handleDepartmentBlur}
          required
          disabled={submitting || pending}
          aria-label="Department"
        >
          <option value="">Select department</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {!department && submitted && (
          <p className="reg-field__error" role="alert">Choose department</p>
        )}
      </div>

      <div className="reg-field">
        <label className="reg-field__label" htmlFor="reg-contact">
          Contact Number
          <span className="reg-field__req" aria-hidden="true"> *</span>
        </label>
        <input
          id="reg-contact"
          name="contact"
          type="tel"
          className="reg-field__input"
          value={contact}
          onChange={updateContact}
          onBlur={handleContactBlur}
          required
          autoComplete="tel"
          placeholder="+91 98765 43210"
          inputMode="tel"
          disabled={submitting || pending}
        />
        {contactError && (
          <p className="reg-field__error" role="alert">{contactError}</p>
        )}
      </div>

      <fieldset className="reg-group">
        <legend className="reg-group__legend">
          Gender
          <span className="reg-field__req" aria-hidden="true"> *</span>
        </legend>
        <div className="reg-options" role="radiogroup" aria-label="Gender">
          {GENDER_ORDER.map((id) => {
            const g = GENDERS[id];
            return (
              <label key={id} className="reg-option">
                <input
                  type="radio"
                  name="gender"
                  value={id}
                  checked={gender === id}
                  onChange={() => handleGender(id)}
                  className="reg-option__input"
                  disabled={submitting || pending}
                  aria-checked={gender === id}
                />
                <span className="reg-option__label">{g.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="reg-group">
        <legend className="reg-group__legend">
          College Tag
          <span className="reg-field__req" aria-hidden="true"> *</span>
        </legend>
        <div className="reg-options" role="radiogroup" aria-label="College tag">
          {tagOptions.map((opt) => (
            <label key={opt.id} className="reg-option">
              <input
                type="radio"
                name="tag"
                value={opt.id}
                checked={tag === opt.id}
                onChange={() => handleTag(opt.id)}
                className="reg-option__input"
                disabled={submitting || pending}
                aria-checked={tag === opt.id}
              />
              <span
                className="reg-option__swatch"
                style={{ backgroundColor: opt.swatch }}
                aria-hidden="true"
              />
              <span className="reg-option__label">{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="reg-outcome" aria-live="polite">
        {submitError && (
          <p className="reg-outcome__error" role="alert">
            {submitError}
          </p>
        )}
        {submitMessage && <p className="reg-outcome__success">{submitMessage}</p>}
      </div>

      <button
        type="submit"
        className="reg-submit"
        disabled={submitting || pending}
        aria-busy={submitting || pending}
        aria-label="Submit registration"
      >
        <span className="reg-submit__text">
          {submitting || pending ? 'REGISTERING…' : 'SUBMIT REGISTRATION'}
        </span>
        {(submitting || pending) && (
          <span className="reg-submit__spinner" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="reg-back"
        onClick={handleBack}
        disabled={submitting || pending}
        aria-label="Return to MAFIAS home"
      >
        Back to MAFIAS
      </button>

      <p className="reg-note">
        Your contact details are stored only for registration purposes.
      </p>
    </form>
  );
}
