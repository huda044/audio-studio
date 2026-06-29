import React, { useEffect, useRef } from 'react';

// Holographic 3D ring — sekarang warna lebih kaya, dual gradient, lebih cepat.
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
    let running = false, inView = true;

    const R = 1, r = 0.4, NU = 48, NV = 16;
    const pts = [];
    for (let i = 0; i < NU; i += 1) {
      for (let j = 0; j < NV; j += 1) {
        const u = (i / NU) * Math.PI * 2;
        const v = (j / NV) * Math.PI * 2;
        pts.push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]);
      }
    }

    // Dual sprite: cyan + purple glow
    const SPRITE = 32;
    const sprites = [];
    for (const [r1, g1, b1, a1, r2, g2, b2] of [[150, 220, 255, 168, 85, 247]]) {
      const s = document.createElement('canvas'); s.width = SPRITE; s.height = SPRITE;
      const sc = s.getContext('2d');
      const grd = sc.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      grd.addColorStop(0, `rgba(${r1},${g1},${b1},0.95)`);
      grd.addColorStop(0.4, `rgba(${r2},${g2},${b2},0.55)`);
      grd.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
      sc.fillStyle = grd; sc.fillRect(0, 0, SPRITE, SPRITE);
      sprites.push(s);
    }

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      ax += (tax - ax) * 0.08; ay += (tay - ay) * 0.08;
      tay += 0.006;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, scale = Math.min(w, h) * 0.35;
      const cosX = Math.cos(ax), sinX = Math.sin(ax), cosY = Math.cos(ay), sinY = Math.sin(ay);
      for (let k = 0; k < pts.length; k += 1) {
        const [x, y, z] = pts[k];
        const x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        const persp = 3 / (3 + z2);
        const sx = cx + x1 * scale * persp;
        const sy = cy + y1 * scale * persp;
        const depth = (z2 + 1.5) / 3;
        const size = Math.max(2, 5 * persp);
        ctx.globalAlpha = 0.3 + depth * 0.6;
        // Interpolate between two sprites based on depth
        const idx = depth > 0.6 ? 0 : 0;
        ctx.drawImage(sprites[idx], sx - size / 2, sy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(frame);
    }

    function start() { if (running || reduce || !inView) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      tax = -0.5 + ((e.clientY - rect.top) / rect.height - 0.5) * 1;
      tay = ((e.clientX - rect.left) / rect.width - 0.5) * 1.5 + tay % (Math.PI * 2);
    };
    const onVisibility = () => { if (document.hidden) stop(); else start(); };

    const io = new IntersectionObserver(
      (entries) => { const v = entries[0]?.isIntersecting; inView = Boolean(v); if (v) start(); else stop(); },
      { threshold: 0 }
    );
    io.observe(canvas);

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('visibilitychange', onVisibility);
    if (reduce) { frame(); } else { start(); }

    return () => {
      stop(); io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="hero-ring" aria-hidden="true" />;
}
