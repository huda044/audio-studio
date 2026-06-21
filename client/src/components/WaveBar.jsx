import React, { useEffect, useRef } from 'react';

// Mini-waveform tanpa dependency: dekode audio via Web Audio API lalu gambar peaks.
let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    sharedCtx = AC ? new AC() : null;
  }
  return sharedCtx;
}

export default function WaveBar({ src, bars = 56 }) {
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const ctxA = getCtx();
    if (!ctxA || !src) return undefined;

    function draw(peaks) {
      const c = ref.current;
      if (!c) return;
      const g2 = c.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
      g2.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2.clearRect(0, 0, w, h);
      const max = Math.max(...peaks, 0.01);
      const bw = w / peaks.length;
      peaks.forEach((p, i) => {
        const bh = Math.max(2, (p / max) * (h - 4));
        const x = i * bw;
        const y = (h - bh) / 2;
        const grad = g2.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, '#22d3ee');
        grad.addColorStop(1, '#a855f7');
        g2.fillStyle = grad;
        const r = Math.min(bw * 0.3, 2);
        const bx = x + bw * 0.2;
        const bwd = bw * 0.6;
        g2.beginPath();
        if (g2.roundRect) g2.roundRect(bx, y, bwd, bh, r); else g2.rect(bx, y, bwd, bh);
        g2.fill();
      });
    }

    (async () => {
      try {
        const res = await fetch(src);
        const arr = await res.arrayBuffer();
        if (cancelled) return;
        const audio = await ctxA.decodeAudioData(arr.slice(0));
        if (cancelled) return;
        const ch = audio.getChannelData(0);
        const block = Math.max(1, Math.floor(ch.length / bars));
        const peaks = [];
        for (let i = 0; i < bars; i += 1) {
          let mx = 0;
          for (let j = 0; j < block; j += 1) {
            const v = Math.abs(ch[i * block + j] || 0);
            if (v > mx) mx = v;
          }
          peaks.push(mx);
        }
        if (!cancelled) draw(peaks);
      } catch {
        // Format tidak bisa didekode di browser ini — lewati saja.
      }
    })();

    return () => { cancelled = true; };
  }, [src, bars]);

  return <canvas ref={ref} className="wavebar" aria-hidden="true" />;
}
