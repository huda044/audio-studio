import React, { useEffect, useRef } from 'react';

// Background world berlapis: deep space + aurora + particle universe + cyber grid + orbs + noise.
export default function CyberBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let running = false;
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -999, y: -999 };
    let particles = [];

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Lebih sedikit partikel di layar kecil / mobile supaya tetap ringan & hemat baterai.
      const divisor = coarse ? 22000 : 14000;
      const cap = coarse ? 80 : 150;
      const target = Math.min(cap, Math.floor((w * h) / divisor));
      particles = Array.from({ length: reduce ? Math.min(40, target) : target }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.4,
        hue: Math.random() > 0.5 ? 188 : 258
      }));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          const f = (140 - dist) / 140;
          p.x += (dx / dist) * f * 1.2; p.y += (dy / dist) * f * 1.2;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, 0.7)`;
        ctx.fill();
      }
      // connecting lines
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i], b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(120,180,255,${(1 - d / 110) * 0.12})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      if (running) raf = requestAnimationFrame(step);
    }

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -999; mouse.y = -999; };

    function start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    if (reduce) step(); else start();

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="cyber-bg" aria-hidden="true">
      <div className="cb-space" />
      <div className="cb-aurora" />
      <div className="cb-grid" />
      <div className="cb-orb cb-orb-1" />
      <div className="cb-orb cb-orb-2" />
      <div className="cb-orb cb-orb-3" />
      <canvas ref={canvasRef} className="cb-particles" />
      <div className="cb-noise" />
      <div className="cb-scan" />
    </div>
  );
}
