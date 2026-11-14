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
    font: "", fontFile: "", motion: "on", todo: false, countdown: null, feedItems: null,
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
  if (C.platform) root.dataset.platform = C.platform;   // "android" in Ignifox for Android
  root.dataset.tiles = C.tileStyle;
  root.dataset.wall = C.wallpaper == "image" && !C.wallpaperFile && !C.wallpaperData ? "gradient" : C.wallpaper;
  if (C.wallpaper == "image" && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(C.wallpaperData || "")) {
    $("wall").style.backgroundImage = `url("${C.wallpaperData}")`;   // Android hands the picture over inline
  } else if (C.wallpaper == "image" && C.wallpaperFile && /^[\w.-]+\.(mp4|webm|ogv|mov)$/i.test(C.wallpaperFile)) {
    // A video wallpaper: muted, looping, never takes focus.
    const v = document.createElement("video");
    Object.assign(v, { src: C.wallpaperFile, muted: true, loop: true, autoplay: true, playsInline: true, disablePictureInPicture: true });
    v.setAttribute("aria-hidden", "true");
    v.id = "wall-video";
    $("wall").prepend(v);
    if (C.motion == "off") v.addEventListener("loadeddata", () => v.pause(), { once: true });
  } else if (C.wallpaper == "image" && C.wallpaperFile && /^[\w.-]+$/.test(C.wallpaperFile)) {
    $("wall").style.backgroundImage = `url("${C.wallpaperFile}")`;   // pictures and animated GIFs
  }

  // ---- custom font for clock + greeting (an imported font, or any installed family)
  if (C.font) {
    const fam = C.font.replace(/["\\;{}]/g, "");
    const use = () => root.style.setProperty("--nt-font", `"${C.fontFile ? "igniNT" : fam}", system-ui, sans-serif`);
    if (C.fontFile && /^ntfont\.\w+$/.test(C.fontFile) && "FontFace" in window) {
      new FontFace("igniNT", `url("${C.fontFile}")`).load().then(f => { document.fonts.add(f); use(); }, use);
    } else {
      use();
    }
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

  // ---- side column: countdown, to-do, notes, news. Everything typed here stays in this page's storage.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const feedItems = Array.isArray(C.feedItems) ? C.feedItems : Array.isArray(window.IGNI_FEEDS) ? window.IGNI_FEEDS : [];
  const cd = C.countdown && C.countdown.date ? new Date(C.countdown.date) : null;
  const show = { countdown: !!(cd && !isNaN(cd)), todo: !!C.todo, notes: !!C.notes, feeds: feedItems.length > 0 };
  for (const [id, on] of Object.entries(show)) $(id).hidden = !on;
  $("side").hidden = !Object.values(show).some(Boolean);
  root.toggleAttribute("data-side", !$("side").hidden);

  if (show.notes) {
    const nt = $("notes-text");
    try { nt.value = localStorage.getItem("igni-notes") || ""; } catch (e) {}
    nt.addEventListener("input", () => { try { localStorage.setItem("igni-notes", nt.value); } catch (e) {} });
  }

  if (show.countdown) {
    $("cd-title").textContent = (C.countdown.title || "Countdown").slice(0, 60);
    const out = $("cd-value");
    const paint = () => {
      let ms = cd - Date.now();
      const past = ms < 0; ms = Math.abs(ms);
      const d = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60;
      out.replaceChildren();
      const big = document.createElement("b"); big.textContent = d > 0 ? `${d}` : `${hh}:${String(mm).padStart(2, "0")}`;
      const small = document.createElement("span");
      small.textContent = d > 0 ? ` day${d == 1 ? "" : "s"}${hh ? `, ${hh} h` : ""}${past ? " ago" : " to go"}` : past ? " ago" : " to go";
      out.append(big, small);
    };
    paint();
    setInterval(paint, 30000);
  }

  if (show.todo) {
    const list = $("todo-list"), input = $("todo-in");
    let items = store.get("igni-todo", []);
    const save = () => store.set("igni-todo", items);
    const render = () => {
      list.replaceChildren(...items.map((it, i) => {
        const li = document.createElement("li");
        li.classList.toggle("done", !!it.done);
        const box = document.createElement("input");
        box.type = "checkbox"; box.checked = !!it.done; box.setAttribute("aria-label", "Done");
        box.addEventListener("change", () => { it.done = box.checked; save(); render(); });
        const txt = document.createElement("span"); txt.textContent = it.text;
        const del = document.createElement("button"); del.textContent = "×"; del.title = "Remove";
        del.addEventListener("click", () => { items.splice(i, 1); save(); render(); });
        li.append(box, txt, del);
        return li;
      }));
    };
    render();
    $("todo-form").addEventListener("submit", e => {
      e.preventDefault();
      const text = input.value.trim().slice(0, 200);
      if (!text) return;
      items.push({ text, done: false }); input.value = ""; save(); render();
    });
  }

  if (show.feeds) {
    const list = $("feed-list");
    for (const it of feedItems.slice(0, 30)) {
      let url;
      try { url = new URL(it.link); } catch (e) { continue; }
      if (!/^https?:$/.test(url.protocol)) continue;
      const li = document.createElement("li");
      const a = document.createElement("a"); a.href = url.href; a.textContent = String(it.title || url.hostname).slice(0, 160);
      const src = document.createElement("small"); src.textContent = String(it.source || url.hostname.replace(/^www\./, "")).slice(0, 40);
      li.append(a, src);
      list.append(li);
    }
  }

  // ---- gear tip
  $("gear").addEventListener("click", e => { e.stopPropagation(); $("gear-tip").hidden = !$("gear-tip").hidden; });
  document.addEventListener("click", e => { if (!e.target.closest("#gear-tip")) $("gear-tip").hidden = true; });

  // ---- animated wallpapers: the effects themselves live in fx.js (shared with Studio)
  const FX = window.IGNI_FX;

  // Motion: "on" always animates (you picked an animated wallpaper), "system" pauses when the
  // desktop asks for less motion, "off" shows a still frame.
  const motion = ["on", "system", "off"].includes(C.motion) ? C.motion : "on";
  root.dataset.motion = motion;
  if (FX && FX.has(root.dataset.wall)) {
    root.setAttribute("data-fx", "");
    const cv = $("fx"), ctx = cv.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const still = () => motion == "off" || (motion == "system" && reduce.matches);
    let draw = null, W = -1, H = -1, running = false;
    const fit = () => {
      // The page can be laid out before it has a size (Firefox preloads new tabs), so the effect
      // is (re)built whenever the size changes rather than once at start.
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w == W && h == H && draw) return;
      W = w; H = h;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw = FX.create(root.dataset.wall, W, H, P);
    };
    function frame(t) {
      fit();
      if (draw) draw(ctx, t);
      running = !still() && !document.hidden;
      if (running) requestAnimationFrame(frame);
    }
    const start = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
    start();
    addEventListener("resize", () => { fit(); start(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
    reduce.addEventListener?.("change", start);
  }

  if (C.search && !C.noAutofocus) q.focus();
})();
