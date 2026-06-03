import { motion } from 'framer-motion';

export default function AnimatedButton({ children, className = '', whileTap = true, ...props }) {
  return (
    <motion.button
      className={`animated-btn ${className}`}
      whileTap={whileTap ? { scale: 0.96 } : undefined}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
