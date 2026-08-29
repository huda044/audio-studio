import React from 'react';

// Skeleton loading sederhana — div polos + animasi CSS pulse (lihat styles.css).
export function Skeleton({ w = '100%', h = 40, r = 12, mb = 0 }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, marginBottom: mb }} aria-hidden="true" />;
}

export default Skeleton;
