import { motion } from 'framer-motion';

export function SkeletonLine({ width = '100%', height = 14, className = '' }) {
  return (
    <motion.div
      className={`skeleton-line ${className}`}
      style={{ width, height }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`skeleton-card ${className}`}>
      <SkeletonLine width="60%" height={16} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="80%" height={12} />
    </div>
  );
}
