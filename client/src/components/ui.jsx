import React from 'react';
import { motion } from 'framer-motion';

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } }
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

export function Card({ icon, title, desc, children, className = '', delay = 0 }) {
  return (
    <motion.section
      className={`card ${className}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay }}
    >
      {(title || icon) && (
        <h2 className="card-title">{icon && <span className="ico">{icon}</span>}{title}</h2>
      )}
      {desc && <p className="card-desc">{desc}</p>}
      {children}
    </motion.section>
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
