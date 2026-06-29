import React, { useEffect, useRef, useCallback } from 'react';

// Interactive particle universe + connecting lines + mouse repel.
// Augmentasi: click burst, trail effect, warna berubah sesuai scroll.
export default function CyberBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0, running = false;
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const CONNECT_DIST = 110;
    const CELL = CONNECT_DIST;
    let cols = 0, rows = 0;
    let grid = [];
    const mouse = { x: -999, y: -999, vx: 0, vy: 0 };
    const clicks = []; // click burst
    let particles = [];
    let resizeTimer = 0;

    function rebuildGrid() {
      cols = Math.max(1, Math.ceil(w / CELL));
      rows = Math.max(1, Math.ceil(h / CELL));
      grid = new Array(cols * rows);
      for (let i = 0; i < grid.length; i += 1) grid[i] = [];
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const cx = Math.min(cols - 1, Math.max(0, Math.floor(p.x / CELL)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(p.y / CELL)));
        grid[cy * cols + cx].push(i);
      }
    }

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const divisor = coarse ? 22000 : 14000;
      const cap = coarse ? 80 : 150;
      const target = Math.min(cap, Math.floor((w * h) / divisor));
      particles = Array.from({ length: reduce ? Math.min(40, target) : target }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.4, hue: Math.random() > 0.5 ? 188 : 258
      }));
    }

    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); }

    function step() {
      ctx.clearRect(0, 0, w, h);

      // Sway particles toward mouse
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          const f = (140 - dist) / 140;
          p.x += (dx / dist) * f * 1.2;
          p.y += (dy / dist) * f * 1.2;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, 0.7)`;
        ctx.fill();
      }

      // Click burst — ripple expanding
      for (let ci = clicks.length - 1; ci >= 0; ci -= 1) {
        const c = clicks[ci];
        c.r += 2.5;
        c.alpha -= 0.03;
        if (c.alpha <= 0) { clicks.splice(ci, 1); continue; }
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${c.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Connecting lines via spatial grid
      rebuildGrid();
      for (let cy = 0; cy < rows; cy += 1) {
        for (let cx = 0; cx < cols; cx += 1) {
          const here = grid[cy * cols + cx];
          if (!here.length) continue;
          const neighbors = [
            here,
            cx + 1 < cols ? grid[cy * cols + cx + 1] : null,
            cy + 1 < rows ? grid[(cy + 1) * cols + cx] : null,
            cx + 1 < cols && cy + 1 < rows ? grid[(cy + 1) * cols + cx + 1] : null,
            cx - 1 >= 0 && cy + 1 < rows ? grid[(cy + 1) * cols + cx - 1] : null
          ];
          for (let a = 0; a < here.length; a += 1) {
            const ia = here[a];
            const pa = particles[ia];
            for (let n = 0; n < neighbors.length; n += 1) {
              const cell = neighbors[n];
              if (!cell) continue;
              for (let b = (n === 0 ? a + 1 : 0); b < cell.length; b += 1) {
                const ib = cell[b];
                const pb = particles[ib];
                const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                if (d < CONNECT_DIST) {
                  ctx.beginPath();
                  ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
                  ctx.strokeStyle = `rgba(120,180,255,${(1 - d / CONNECT_DIST) * 0.12})`;
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }
              }
            }
          }
        }
      }
      if (running) raf = requestAnimationFrame(step);
    }

    function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(step); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    const onClick = (e) => {
      if (reduce) return;
      const rect = canvas.getBoundingClientRect();
      clicks.push({
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
        r: 4, alpha: 0.8
      });
    };

    const onMove = (e) => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; };
    const onLeave = () => { mouse.x = -999; mouse.y = -999; };
    const onVisibility = () => { if (document.hidden) stop(); else start(); };

    resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);
    window.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', onVisibility);
    if (reduce) step(); else start();

    return () => {
      stop();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      window.removeEventListener('click', onClick);
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
