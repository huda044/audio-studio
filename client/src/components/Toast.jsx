import { motion, AnimatePresence } from 'framer-motion';

const toastVariants = {
  initial: { opacity: 0, x: 80, scale: 0.9 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 80, scale: 0.9 },
};

export default function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="toast"
          className={`toast ${toast.type}`}
          variants={toastVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
