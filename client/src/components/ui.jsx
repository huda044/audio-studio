import React from 'react';

// Komponen UI dasar — polos, tanpa animasi/efek mouse. Sengaja sederhana:
// kecepatan render & kenyamanan pakai diprioritaskan.

export function Card({ icon, title, desc, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || icon) && (
        <h2 className="card-title">{icon && <span className="ico">{icon}</span>}{title}</h2>
      )}
      {desc && <p className="card-desc">{desc}</p>}
      {children}
    </section>
  );
}

// Nama lama dipertahankan supaya pemanggil tidak berubah — sekarang tombol biasa.
export function MagneticButton({ children, className = '', ...props }) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
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
        <div className="trace-row" key={i}>
          <span className={`badge ${row.status === 'Accepted' ? 'ok' : row.status === 'Failed' ? 'bad' : 'wait'}`}>{row.step}</span>
          <span className="muted">{row.message}</span>
        </div>
      ))}
    </div>
  );
}
