/* Ignifox New Tab. Unprivileged: reads window.IGNI_NEWTAB (config.js), nothing else. */
"use strict";
(() => {
  const C = Object.assign({
    palette: { bg: "#0b0607", bg2: "#170b0c", bg3: "#24110f", fg: "#f3e6e4", fgDim: "#a08c89", accent: "#ff3b1f", accent2: "#ffb02e", dark: true },
    radius: 14, layout: "center", wallpaper: "embers", wallpaperFile: "", dim: 25, blur: 0,
    clock: true, clock24: false, seconds: false, date: true, greeting: true, name: "",
    search: true, engineSwitcher: true,
    engine: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q={searchTerms}", alias: "@ddg" },
    engines: [], links: [], columns: 6, tileStyle: "rounded", favicons: false, notes: false,
  }, window.IGNI_NEWTAB || {});

  const $ = s => document.getElementById(s);
  const root = document.documentElement;
  const P = C.palette;

  // ---- theme
  for (const [k, v] of Object.entries({ bg: P.bg, bg2: P.bg2, bg3: P.bg3, fg: P.fg, dim: P.fgDim, accent: P.accent, accent2: P.accent2 })) {
    root.style.setProperty("--" + k, v);
  }
  root.style.setProperty("--r", Math.max(0, Math.min(32, C.radius + 6)) + "px");
  root.style.setProperty("--cols", C.columns);
  root.style.setProperty("--dimness", (C.dim / 100).toFixed(2));
  root.style.setProperty("--blur", C.blur + "px");
  root.toggleAttribute("data-light", !P.dark);
  root.dataset.layout = C.layout;
  root.dataset.tiles = C.tileStyle;
  root.dataset.wall = C.wallpaper == "image" && !C.wallpaperFile ? "gradient" : C.wallpaper;
  if (C.wallpaper == "image" && C.wallpaperFile && /^[\w.-]+$/.test(C.wallpaperFile)) {
    $("wall").style.backgroundImage = `url("${C.wallpaperFile}")`;
  }

  // ---- clock / date / greeting
  const clock = $("clock"), date = $("date"), greet = $("greeting");
  clock.hidden = !C.clock; date.hidden = !C.date; greet.hidden = !C.greeting;
  function tick() {
    const d = new Date();
    if (C.clock) {
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      let suffix = "";
      if (!C.clock24) { suffix = h < 12 ? "AM" : "PM"; h = h % 12 || 12; }
      clock.textContent = `${C.clock24 ? String(h).padStart(2, "0") : h}:${m}${C.seconds ? ":" + s : ""}`;
      if (suffix) { const sm = document.createElement("small"); sm.textContent = suffix; clock.append(sm); }
    }
    if (C.date) {
      date.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    }
    if (C.greeting) {
      const h = d.getHours();
      const part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      greet.textContent = C.name ? `${part}, ${C.name}` : part;
    }
  }
  tick();
  setInterval(tick, C.seconds ? 1000 : 10000);

  // ---- search
  const form = $("search"), q = $("q"), btn = $("engine-btn"), menu = $("engine-menu");
  form.hidden = !C.search;
  $("hint").hidden = !C.search || !C.engineSwitcher;
  root.toggleAttribute("data-switcher", C.engineSwitcher && C.engines.length > 1);
  let engine = C.engine;
  function setEngine(e) {
    engine = e;
    btn.textContent = e.name;
    q.placeholder = `Search ${e.name} or type an address`;
  }
  setEngine(engine);
  for (const e of C.engines) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const n = document.createElement("span"); n.textContent = e.name;
    const a = document.createElement("small"); a.textContent = e.alias || "";
    li.append(n, a);
    li.addEventListener("click", () => { setEngine(e); toggleMenu(false); q.focus(); });
    menu.append(li);
  }
  function toggleMenu(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    [...menu.children].forEach((li, i) => li.setAttribute("aria-selected", String(C.engines[i] === engine)));
  }
  btn.addEventListener("click", () => toggleMenu(menu.hidden));
  document.addEventListener("click", e => { if (!e.target.closest(".engine")) toggleMenu(false); });

  function looksLikeURL(s) {
    return !/\s/.test(s) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^localhost(:\d+)?(\/|$)/i.test(s) ||
      /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s));
  }
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    let text = q.value.trim();
    if (!text) return;
    let target = engine;
    const m = /^(@\S+)\s+(.+)$/.exec(text);
    if (m) {
      const hit = C.engines.find(e => e.alias && e.alias.toLowerCase() == m[1].toLowerCase());
      if (hit) { target = hit; text = m[2]; }
    }
    if (target === engine && !m && looksLikeURL(text)) {
      location.href = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "https://" + text;
      return;
    }
    location.href = target.url.replace("{searchTerms}", encodeURIComponent(text));
  });
  document.addEventListener("keydown", e => {
    if (e.key == "/" && document.activeElement != q && !e.target.closest("textarea")) { e.preventDefault(); q.focus(); }
    if (e.key == "Escape") toggleMenu(false);
  });

  // ---- tiles
  const tiles = $("tiles");
  const links = (C.links || []).slice(0, 30);
  root.style.setProperty("--count", Math.max(1, links.length));
  for (const l of links) {
    let host = "";
    try { host = new URL(l.url).hostname.replace(/^www\./, ""); } catch (e) { continue; }
    const a = document.createElement("a");
    a.className = "tile"; a.href = l.url; a.title = l.title || host;
    const ico = document.createElement("div"); ico.className = "ico";
    const letter = document.createElement("span");
    letter.textContent = (l.title || host).trim().charAt(0).toUpperCase() || "•";
    if (C.favicons) {
      const img = new Image();
      img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onload = () => ico.replaceChildren(img);
      img.src = new URL("/favicon.ico", l.url).href;
    }
    ico.append(letter);
    const t = document.createElement("div"); t.className = "t"; t.textContent = l.title || host;
    a.append(ico, t);
    tiles.append(a);
  }

  // ---- notes (stay in this page's local storage)
  const notes = $("notes"), nt = $("notes-text");
  notes.hidden = !C.notes;
  if (C.notes) {
    try { nt.value = localStorage.getItem("igni-notes") || ""; } catch (e) {}
    nt.addEventListener("input", () => { try { localStorage.setItem("igni-notes", nt.value); } catch (e) {} });
  }

  // ---- gear tip
  $("gear").addEventListener("click", e => { e.stopPropagation(); $("gear-tip").hidden = !$("gear-tip").hidden; });
  document.addEventListener("click", e => { if (!e.target.closest("#gear-tip")) $("gear-tip").hidden = true; });

  // ---- embers
  if (root.dataset.wall == "embers") {
    const cv = $("fx"), ctx = cv.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W, H, parts = [];
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (y) => ({
      x: Math.random() * W, y: y ?? H + 10, r: 0.6 + Math.random() * 2.2,
      vy: 0.25 + Math.random() * 0.9, vx: (Math.random() - 0.5) * 0.3, life: 0.4 + Math.random() * 0.6,
      hue: Math.random() < 0.65 ? P.accent : P.accent2, ph: Math.random() * 6.28,
    });
    resize();
    addEventListener("resize", resize);
    const count = Math.min(140, Math.round(W * H / 14000));
    for (let i = 0; i < count; i++) parts.push(spawn(Math.random() * H));
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.vy; p.x += p.vx + Math.sin(t / 900 + p.ph) * 0.25; p.life -= 0.0009;
        if (p.y < -10 || p.life <= 0) Object.assign(p, spawn());
        const a = Math.max(0, Math.min(1, p.life)) * Math.min(1, (H - p.y) / 120 + 0.2);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.hue;
        ctx.shadowColor = p.hue; ctx.shadowBlur = 8 * p.r;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      if (!still && !document.hidden) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !still) requestAnimationFrame(frame); });
  }

  if (C.search && !C.noAutofocus) q.focus();
})();
