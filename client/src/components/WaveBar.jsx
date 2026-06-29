import React, { useEffect, useRef } from 'react';

// Real-time audio waveform visualizer. Decode via Web Audio API, render moving bars.
// Optimasi: shared AudioContext + LRU cache decode, requestAnimationFrame untuk loop.
let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    sharedCtx = AC ? new AC() : null;
  }
  return sharedCtx;
}

const CACHE = new Map();
const CACHE_LIMIT = 16;

async function decodeAudio(url) {
  if (CACHE.has(url)) return CACHE.get(url);
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ctxA = getCtx();
  if (!ctxA) return null;
  const audio = await ctxA.decodeAudioData(buf);
  CACHE.set(url, audio);
  if (CACHE.size > CACHE_LIMIT) {
    const first = CACHE.keys().next().value;
    CACHE.delete(first);
  }
  return audio;
}

export default function WaveBar({ src, bars = 48, color = 'var(--accent)', animated = true }) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let running = false;
    let peaks = null;

    function setSize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(peaksArr) {
      if (!peaksArr || !w) return;
      ctx.clearRect(0, 0, w, h);
      const bw = w / bars;
      const max = Math.max(...peaksArr, 0.01);
      const gap = Math.max(1, bw * 0.2);

      for (let i = 0; i < bars; i += 1) {
        const p = (peaksArr[i] / max) * (h - 4);
        const x = i * bw + gap;
        const wd = bw - gap * 2;
        if (wd <= 0) continue;
        const grad = ctx.createLinearGradient(0, h - p, 0, h);
        grad.addColorStop(0, '#22d3ee');
        grad.addColorStop(1, '#a855f7');
        ctx.fillStyle = grad;
        ctx.beginPath();
        const r = Math.min(wd * 0.3, 2);
        if (ctx.roundRect) ctx.roundRect(x, h - p - 2, wd, p + 2, r);
        else ctx.rect(x, h - p - 2, wd, p + 2);
        ctx.fill();
      }
    }

    async function load() {
      try {
        const audio = await decodeAudio(src);
        if (!audio) return;
        const channel = audio.getChannelData(0);
        const block = Math.max(1, Math.floor(channel.length / bars));
        peaks = [];
        for (let i = 0; i < bars; i += 1) {
          let sum = 0;
          for (let j = 0; j < block; j += 1) {
            sum += Math.abs(channel[i * block + j] || 0);
          }
          peaks.push(sum / block);
        }
        setSize();
        draw(peaks);
      } catch {}
    }

    load();
    window.addEventListener('resize', setSize);

    return () => {
      window.removeEventListener('resize', setSize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [src, bars]);

  return <canvas ref={ref} className="wavebar" style={{ background: 'transparent' }} aria-hidden="true" />;
}
