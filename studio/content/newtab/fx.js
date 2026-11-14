/* Ignifox animated wallpapers. Shared by the new tab page and Ignifox Studio's previews, so
   what Studio shows is exactly what a new tab will do. Plain script, no privileges:
   IGNI_FX.create(name, width, height, palette) returns draw(ctx, timeMs), or null. */
"use strict";
window.IGNI_FX = (() => {
  const make = P => ({
    // glowing sparks drifting up
    embers(W, H) {
      const spawn = y => ({
        x: Math.random() * W, y: y ?? H + 10, r: 0.6 + Math.random() * 2.2,
        vy: 0.25 + Math.random() * 0.9, vx: (Math.random() - 0.5) * 0.3, life: 0.4 + Math.random() * 0.6,
        hue: Math.random() < 0.65 ? P.accent : P.accent2, ph: Math.random() * 6.28,
      });
      const parts = Array.from({ length: Math.max(16, Math.min(140, Math.round(W * H / 14000))) }, () => spawn(Math.random() * H));
      return (ctx, t) => {
        ctx.clearRect(0, 0, W, H);
        for (const p of parts) {
          p.y -= p.vy; p.x += p.vx + Math.sin(t / 900 + p.ph) * 0.25; p.life -= 0.0009;
          if (p.y < -10 || p.life <= 0) Object.assign(p, spawn());
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * Math.min(1, (H - p.y) / 120 + 0.2);
          ctx.fillStyle = p.hue; ctx.shadowColor = p.hue; ctx.shadowBlur = 8 * p.r;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      };
    },
    // flying through stars
    starfield(W, H) {
      const spawn = far => ({ x: (Math.random() - 0.5) * W, y: (Math.random() - 0.5) * H, z: far ? W : Math.random() * W, c: Math.random() < 0.8 ? P.fg : P.accent });
      const stars = Array.from({ length: Math.max(70, Math.min(320, Math.round(W * H / 5000))) }, () => spawn(false));
      return ctx => {
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
        for (const s of stars) {
          s.z -= 1.6;
          if (s.z <= 1) Object.assign(s, spawn(true));
          const k = 220 / s.z, x = s.x * k + W / 2, y = s.y * k + H / 2;
          if (x < 0 || x > W || y < 0 || y > H) { Object.assign(s, spawn(true)); continue; }
          ctx.globalAlpha = Math.min(1, 1.15 - s.z / W);
          ctx.fillStyle = s.c;
          const r = Math.max(0.5, (1 - s.z / W) * 2.4);
          ctx.fillRect(x, y, r, r);
        }
      };
    },
    // falling code in the accent colour
    matrix(W, H) {
      const size = 16, cols = Math.ceil(W / size);
      const rows = Math.ceil(H / size);
      const drops = Array.from({ length: cols }, () => Math.floor(Math.random() * rows));
      const glyphs = "アイウエオカキクケコサシスセソ0123456789ABCDEF<>/*+=";
      let last = -1;
      const step = ctx => {
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.14; ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        ctx.font = size + "px monospace";
        for (let i = 0; i < cols; i++) {
          const y = drops[i] * size;
          ctx.globalAlpha = 0.9; ctx.fillStyle = Math.random() < 0.04 ? P.fg : P.accent;
          ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], i * size, y);
          drops[i] = y > H && Math.random() > 0.975 ? 0 : drops[i] + 1;
        }
      };
      return (ctx, t) => {
        if (last < 0) { for (let i = 0; i < 24; i++) step(ctx); }   // start with trails already on screen
        else if (t - last < 55) return;
        last = t;
        step(ctx);
      };
    },
    // slow snowfall
    snow(W, H) {
      const flakes = Array.from({ length: Math.max(30, Math.min(180, Math.round(W * H / 9000))) }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 2.4, v: 0.3 + Math.random() * 0.9, ph: Math.random() * 6.28,
      }));
      return (ctx, t) => {
        ctx.shadowBlur = 0; ctx.clearRect(0, 0, W, H); ctx.fillStyle = P.fg;
        for (const f of flakes) {
          f.y += f.v; f.x += Math.sin(t / 1400 + f.ph) * 0.35;
          if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
          ctx.globalAlpha = 0.25 + f.r / 5;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
      };
    },
  });
  const NAMES = Object.keys(make({}));
  return {
    names: NAMES,
    has: name => NAMES.includes(name),
    create(name, W, H, palette) {
      const fx = NAMES.includes(name) ? make(palette)[name] : null;
      return fx && W > 0 && H > 0 ? fx(W, H) : null;
    },
  };
})();
