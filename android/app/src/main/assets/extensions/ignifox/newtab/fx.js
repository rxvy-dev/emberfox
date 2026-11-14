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
    // a wall of fire along the bottom edge: many soft blobs drawn additively, hot at the base
    flames(W, H) {
      const sprite = (color, size = 64) => {
        const c = new OffscreenCanvas(size, size), g = c.getContext("2d");
        const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grd.addColorStop(0, color); grd.addColorStop(0.4, color); grd.addColorStop(1, "transparent");
        g.fillStyle = grd; g.fillRect(0, 0, size, size);
        return c;
      };
      const hot = sprite(P.accent2), warm = sprite(P.accent), core = sprite(P.fg);
      const height = Math.max(120, H * 0.42);
      const n = Math.max(80, Math.min(420, Math.round(W / 3.2)));
      const spawn = () => ({
        x: Math.random() * W, y: H + 10, r: (26 + Math.random() * 46) * Math.max(0.6, Math.min(1.4, W / 1400)),
        vy: (1.2 + Math.random() * 1.8) * (height / 320), life: 1, decay: 0.012 + Math.random() * 0.018,
        ph: Math.random() * 6.28, sway: 0.4 + Math.random() * 0.8,
      });
      const parts = Array.from({ length: n }, () => {
        const p = spawn(); p.life = Math.random(); p.y = H + 10 - (1 - p.life) * height; return p;
      });
      return (ctx, t) => {
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.clearRect(0, 0, W, H);
        // glow of the embers bed
        const bed = ctx.createLinearGradient(0, H, 0, H - height * 0.7);
        bed.addColorStop(0, P.accent); bed.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.35; ctx.fillStyle = bed; ctx.fillRect(0, H - height * 0.7, W, height * 0.7);
        ctx.globalCompositeOperation = "lighter";
        for (const p of parts) {
          p.y -= p.vy; p.life -= p.decay;
          p.x += Math.sin(t / 260 + p.ph) * p.sway;
          if (p.life <= 0) Object.assign(p, spawn());
          const r = p.r * (0.35 + p.life * 0.75);
          const img = p.life > 0.75 ? core : p.life > 0.4 ? hot : warm;
          ctx.globalAlpha = Math.min(1, p.life * 0.9) * (img === core ? 0.25 : 0.5);
          ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      };
    },
    // rain with the odd flash of lightning
    storm(W, H) {
      const drops = Array.from({ length: Math.max(60, Math.min(420, Math.round(W * H / 4500))) }, () => ({
        x: Math.random() * W * 1.2, y: Math.random() * H, l: 10 + Math.random() * 18, v: 9 + Math.random() * 7,
      }));
      let flash = 0, bolt = null, next = 1500 + Math.random() * 5000, last = 0;
      const makeBolt = () => {
        const pts = [[W * (0.2 + Math.random() * 0.6), 0]];
        while (pts[pts.length - 1][1] < H * (0.5 + Math.random() * 0.4)) {
          const [x, y] = pts[pts.length - 1];
          pts.push([x + (Math.random() - 0.5) * 70, y + 20 + Math.random() * 40]);
        }
        return pts;
      };
      return (ctx, t) => {
        const dt = last ? Math.min(100, t - last) : 16; last = t;
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
        next -= dt;
        if (next <= 0) { flash = 1; bolt = makeBolt(); next = 2500 + Math.random() * 7000; }
        if (flash > 0) {
          ctx.globalAlpha = flash * 0.22; ctx.fillStyle = P.fg; ctx.fillRect(0, 0, W, H);
          if (bolt && flash > 0.5) {
            ctx.globalAlpha = flash; ctx.strokeStyle = P.fg; ctx.lineWidth = 2;
            ctx.shadowColor = P.accent2; ctx.shadowBlur = 18;
            ctx.beginPath(); bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
            ctx.shadowBlur = 0;
          }
          flash -= dt / 350;
        }
        ctx.globalAlpha = 0.35; ctx.strokeStyle = P.fg; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.v; d.x -= d.v * 0.25;
          if (d.y > H) { d.y = -d.l; d.x = Math.random() * W * 1.2; }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.25, d.y + d.l);
        }
        ctx.stroke();
      };
    },
    // a few glowing fireflies wandering about
    fireflies(W, H) {
      const flies = Array.from({ length: Math.max(14, Math.min(60, Math.round(W * H / 30000))) }, () => ({
        x: Math.random() * W, y: Math.random() * H, a: Math.random() * 6.28, s: 0.2 + Math.random() * 0.5,
        ph: Math.random() * 6.28, r: 1.5 + Math.random() * 2,
      }));
      return (ctx, t) => {
        ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
        for (const f of flies) {
          f.a += (Math.random() - 0.5) * 0.25;
          f.x += Math.cos(f.a) * f.s; f.y += Math.sin(f.a) * f.s;
          if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
          if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
          const glow = 0.5 + 0.5 * Math.sin(t / 700 + f.ph);
          ctx.globalAlpha = 0.15 + glow * 0.85;
          ctx.fillStyle = P.accent2; ctx.shadowColor = P.accent2; ctx.shadowBlur = 14 * glow + 4;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
        ctx.shadowBlur = 0;
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
