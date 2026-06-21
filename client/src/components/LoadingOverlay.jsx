import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const STAGE_LABEL = {
  queue: 'Antrian',
  probe: 'Analisis file',
  convert: 'Menerapkan efek',
  split: 'Memotong part'
};

export default function LoadingOverlay({ open, percent = 0, stage = '', message = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="overlay-card neon-border"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className="ov-scan" />
            <div className="ov-ring" style={{ '--p': `${pct * 3.6}deg` }}>
              <div className="ov-ring-inner">
                <span className="ov-pct">{pct}<small>%</small></span>
              </div>
            </div>
            <h3 className="ov-title"><Loader2 className="spin" size={16} /> {STAGE_LABEL[stage] || 'Memproses'}</h3>
            <p className="ov-msg">{message || 'Sedang memproses audio...'}</p>
            <div className="ov-bar"><motion.span className="ov-bar-fill" animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut', duration: 0.3 }} /></div>
            <p className="ov-hint muted small">Lagu panjang butuh waktu lebih lama di server gratis. Jangan tutup tab ini.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
