import React from 'react';
import { motion } from 'framer-motion';

// Skeleton shimmer — loading placeholder untuk komponen lazy-loaded.
export function Skeleton({ w = '100%', h = 40, r = 12, mb = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: w, height: h, borderRadius: r, marginBottom: mb,
        background: 'linear-gradient(90deg, rgba(124,162,214,0.08) 0%, rgba(124,162,214,0.18) 50%, rgba(124,162,214,0.08) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite'
      }}
    />
  );
}

// Shimmer keyframe di CSS
export function addShimmerStyles() {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }`;
  document.head.appendChild(style);
}

export default Skeleton;
