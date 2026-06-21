import React, { useEffect, useRef } from 'react';

// Holographic 3D ring (torus wireframe) di canvas 2D — ringan, tanpa Three.js.
export default function HeroRing() {
  const ref = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0, w = 0, h = 0;
    let ax = -0.5, ay = 0, tax = -0.5, tay = 0;

    // Generate titik torus
    const R = 1, r = 0.4, NU = 48, NV = 16;
    const pts = [];
    for (let i = 0; i < NU; i += 1) {
      for (let j = 0; j < NV; j += 1) {
        const u = (i / NU) * Math.PI * 2;
        const v = (j / NV) * Math.PI * 2;
        pts.push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]);
      }
    }

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      ax += (tax - ax) * 0.05; ay += (tay - ay) * 0.05;
      tay += 0.004;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, scale = Math.min(w, h) * 0.32;
      const cosX = Math.cos(ax), sinX = Math.sin(ax), cosY = Math.cos(ay), sinY = Math.sin(ay);
      for (let k = 0; k < pts.length; k += 1) {
        let [x, y, z] = pts[k];
        // rotate Y then X
        let x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
        let y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        const persp = 3 / (3 + z2);
        const sx = cx + x1 * scale * persp;
        const sy = cy + y1 * scale * persp;
        const depth = (z2 + 1.5) / 3;
        const hue = 188 + depth * 80;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4 * persp, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, ${55 + depth * 20}%, ${0.35 + depth * 0.5})`;
        ctx.shadowBlur = 8 * persp; ctx.shadowColor = `hsla(${hue},90%,65%,0.9)`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      tax = -0.5 + ((e.clientY - rect.top) / rect.height - 0.5) * 0.8;
      tay = ((e.clientX - rect.left) / rect.width - 0.5) * 1.2 + tay % (Math.PI * 2);
    };
    resize();
    window.addEventListener('resize', resize);
    if (!reduce) {
      window.addEventListener('mousemove', onMove);
      raf = requestAnimationFrame(frame);
    } else { frame(); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove); };
  }, []);

  return <canvas ref={ref} className="hero-ring" aria-hidden="true" />;
}
