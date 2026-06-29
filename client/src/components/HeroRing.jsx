import React, { useEffect, useRef } from 'react';

// Holographic 3D ring (torus wireframe) di canvas 2D — ringan, tanpa Three.js.
// Optimasi: pre-render glow sprite (drawImage jauh lebih murah daripada shadowBlur per-titik),
// pause saat tab hidden & saat ring di luar viewport (IntersectionObserver).
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
    let running = false;
    let inView = true;

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

    // Pre-render glow sprite sekali (radial gradient di offscreen canvas).
    // Sebelumnya setiap titik memakai ctx.shadowBlur yang sangat mahal di GPU.
    const SPRITE = 24;
    const sprite = document.createElement('canvas');
    sprite.width = SPRITE; sprite.height = SPRITE;
    const sctx = sprite.getContext('2d');
    const grad = sctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    grad.addColorStop(0, 'rgba(150,220,255,0.95)');
    grad.addColorStop(0.4, 'rgba(120,200,255,0.55)');
    grad.addColorStop(1, 'rgba(120,200,255,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE, SPRITE);

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
        const [x, y, z] = pts[k];
        // rotate Y then X
        const x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        const persp = 3 / (3 + z2);
        const sx = cx + x1 * scale * persp;
        const sy = cy + y1 * scale * persp;
        const depth = (z2 + 1.5) / 3;
        const size = Math.max(2, 5 * persp);
        ctx.globalAlpha = 0.35 + depth * 0.5;
        ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(frame);
    }

    function start() { if (running || reduce || !inView) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      tax = -0.5 + ((e.clientY - rect.top) / rect.height - 0.5) * 0.8;
      tay = ((e.clientX - rect.left) / rect.width - 0.5) * 1.2 + tay % (Math.PI * 2);
    };
    const onVisibility = () => { if (document.hidden) stop(); else start(); };

    // IntersectionObserver: pause saat ring sudah tidak terlihat (user scroll ke bawah).
    // Sebelumnya animasi torus tetap berjalan walau offscreen.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting;
        inView = Boolean(visible);
        if (inView) start(); else stop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('visibilitychange', onVisibility);
    if (reduce) { frame(); } else { start(); }

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="hero-ring" aria-hidden="true" />;
}
