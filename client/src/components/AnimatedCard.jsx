import { motion } from 'framer-motion';

export default function AnimatedCard({ children, className = '', delay = 0, hover = true, ...props }) {
  return (
    <motion.div
      className={`animated-card ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay }}
      whileHover={hover ? { y: -3, transition: { type: 'spring', stiffness: 400, damping: 17 } } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
