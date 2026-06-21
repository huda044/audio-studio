import React, { useRef } from 'react';
import { motion } from 'framer-motion';

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } }
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Card({ icon, title, desc, children, className = '', delay = 0 }) {
  const ref = useRef(null);

  function onMove(e) {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 6}deg) rotateX(${(0.5 - py) * 6}deg) translateY(-2px)`;
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
  }

  return (
    <motion.section
      ref={ref}
      className={`card tilt ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay }}
    >
      <span className="card-glow" aria-hidden="true" />
      {(title || icon) && (
        <h2 className="card-title">{icon && <span className="ico">{icon}</span>}{title}</h2>
      )}
      {desc && <p className="card-desc">{desc}</p>}
      {children}
    </motion.section>
  );
}

// Tombol magnet: tertarik ke cursor + glow. Untuk CTA utama.
export function MagneticButton({ children, className = '', strength = 0.4, ...props }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  }
  function onLeave() { if (ref.current) ref.current.style.transform = ''; }
  return (
    <button ref={ref} className={`btn magnetic ${className}`} onMouseMove={onMove} onMouseLeave={onLeave} {...props}>
      <span className="mag-inner">{children}</span>
    </button>
  );
}

export function Slider({ label, value, min, max, step, suffix = '', onChange }) {
  return (
    <label className="field">
      <span>{label} <b>{value}{suffix}</b></span>
      <input
        className="slider" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className="switch" />
    </button>
  );
}

export function StatusBadge({ status }) {
  const cls = status === 'Accepted' ? 'ok' : status === 'Failed' ? 'bad' : 'wait';
  const label = status === 'Accepted' ? 'Diterima' : status === 'Failed' ? 'Gagal' : 'Pending';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="empty">
      {icon && <div className="e-ico">{icon}</div>}
      <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
      <p className="small" style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

export function Trace({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="trace">
      {items.map((row, i) => (
        <motion.div
          className="trace-row" key={i}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
        >
          <span className={`badge ${row.status === 'Accepted' ? 'ok' : row.status === 'Failed' ? 'bad' : 'wait'}`}>{row.step}</span>
          <span className="muted">{row.message}</span>
        </motion.div>
      ))}
    </div>
  );
}
