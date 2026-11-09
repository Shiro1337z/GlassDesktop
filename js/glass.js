/*
 * Glass Desktop - auto-glass pass.
 *
 * Steam hashes most class names and changes them every client update, so
 * hand-written selectors break. Instead, read Steam's own stylesheets and,
 * for every rule with a dark, fully opaque background colour (or dark
 * gradient stop), emit an override with the same selector, the same colour
 * and alpha = var(--glass-a).
 *
 * Why an override sheet and not in-place edits: editing a rule inside
 * Steam's 5 MB sp.css makes Chrome rebuild that whole sheet's rule set on
 * the next frame (measured: 60-140 ms hitches). Reading the CSSOM is free,
 * so we read in 8 ms slices, then write ONE small <style> per source sheet,
 * inserted right after it so the cascade order is unchanged.
 *
 * After the pass nothing runs except a childList MutationObserver on
 * <head>/<body> that catches lazily loaded chunk stylesheets.
 */
(() => {
  "use strict";
  if (window.__glassDesktop) return;
  window.__glassDesktop = true;
  // Base URL of the theme (for the helper status file), captured at load.
  const SELF = (document.currentScript && document.currentScript.src) || "";

  const ALPHA = "var(--glass-a, .55)";
  const MAX_LUMA = 0.24;      // only dark surfaces; light UI and buttons stay solid
  const SLICE_MS = 8;
  const MARK = "GlassDesktop-override";
  const SKIP_HREF = /millennium\.ftp|GlassDesktop/i;
  const RGB = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g;
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  const cache = new Map();
  const seen = new WeakSet();
  let overrides = 0;

  const isDark = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 <= MAX_LUMA;

  // Glass replacement for one colour, or null to leave it alone.
  function glassColour(value) {
    if (cache.has(value)) return cache.get(value);
    let out = null;
    let m = HEX.exec(value);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      if (isDark(r, g, b)) out = `rgba(${r}, ${g}, ${b}, ${ALPHA})`;
    } else {
      RGB.lastIndex = 0;
      m = RGB.exec(value);
      if (m && m[0].length === value.length) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
        if (a >= 0.99 && isDark(+m[1], +m[2], +m[3])) out = `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${ALPHA})`;
      }
    }
    cache.set(value, out);
    return out;
  }

  function glassGradient(value) {
    if (value.indexOf("gradient") === -1 || value.indexOf("url(") !== -1) return null;
    let changed = false;
    const next = value.replace(RGB, (whole) => {
      const g = glassColour(whole);
      if (g) { changed = true; return g; }
      return whole;
    });
    return changed ? next : null;
  }

  const imp = (style, prop) => (style.getPropertyPriority(prop) ? " !important" : "");

  // Declarations for one rule. `force` re-emits an unconverted background so a
  // later same-selector rule still beats an earlier converted one.
  function declarations(style, force) {
    let out = "";
    const bg = style.backgroundColor;
    if (bg) {
      const g = glassColour(bg.trim());
      if (g) out += `background-color:${g}${imp(style, "background-color")};`;
      else if (force) out += `background-color:${bg}${imp(style, "background-color")};`;
    }
    const img = style.backgroundImage;
    if (img) {
      const g = glassGradient(img);
      if (g) out += `background-image:${g}${imp(style, "background-image")};`;
      else if (force) out += `background-image:${img}${imp(style, "background-image")};`;
    }
    return out;
  }

  // Open/close text for grouping rules we can reproduce faithfully.
  function groupOpen(rule) {
    if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) return `@media ${rule.conditionText || rule.media.mediaText}{`;
    if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule) return `@supports ${rule.conditionText}{`;
    if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) return `@container ${rule.conditionText}{`;
    if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) return `@layer ${rule.name}{`;
    return null; // @keyframes, @font-face, unknown: skip
  }

  // Job: one source sheet, walked iteratively in time slices.
  const jobs = [];
  let running = false;

  function newJob(sheet, rules) {
    return { sheet, stack: [{ rules, i: 0, close: "" }], out: [], converted: new Set() };
  }

  function step(job, end) {
    const { stack, out, converted } = job;
    let n = 0;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i >= top.rules.length) { stack.pop(); if (top.close) out.push(top.close); continue; }
      const rule = top.rules[top.i++];
      if (rule.selectorText !== undefined && rule.style) {
        const sel = rule.selectorText;
        const hadGlass = converted.has(sel);
        const d = declarations(rule.style, hadGlass);
        if (d) {
          out.push(`${sel}{${d}}`);
          converted.add(sel);
        }
      } else if (rule.cssRules && rule.cssRules.length) {
        const open = groupOpen(rule);
        if (open) { out.push(open); stack.push({ rules: rule.cssRules, i: 0, close: "}" }); }
      }
      if ((++n & 127) === 0 && performance.now() > end) return false;
    }
    return true;
  }

  function flush(job) {
    // Drop empty groups like "@media x{}" so the override stays minimal.
    const text = job.out.join("").replace(/@(?:media|supports|container|layer)[^{}]*\{\}/g, "");
    if (!text) return;
    const style = document.createElement("style");
    style.id = `${MARK}-${++overrides}`;
    style.textContent = text;
    const owner = job.sheet.ownerNode;
    if (owner && owner.parentNode) owner.parentNode.insertBefore(style, owner.nextSibling);
    else (document.head || document.documentElement).appendChild(style);
  }

  function pump() {
    const end = performance.now() + SLICE_MS;
    while (jobs.length) {
      const job = jobs[0];
      if (!step(job, end)) { setTimeout(pump, 0); return; }
      jobs.shift();
      flush(job);
      if (performance.now() > end) { setTimeout(pump, 0); return; }
    }
    running = false;
  }

  function addSheet(sheet) {
    if (!sheet || seen.has(sheet)) return;
    const owner = sheet.ownerNode;
    if (owner && owner.id && owner.id.startsWith(MARK)) return;
    if ((sheet.href && SKIP_HREF.test(sheet.href)) || (owner && owner.href && SKIP_HREF.test(owner.href))) return;
    let rules;
    try { rules = sheet.cssRules; } catch (_) { return; } // cross-origin or not loaded yet
    seen.add(sheet);
    jobs.push(newJob(sheet, rules));
    if (!running) { running = true; pump(); }
  }

  function scanAll() {
    for (const s of document.styleSheets) addSheet(s);
  }

  function watchNode(node) {
    if (node.nodeName === "STYLE") { if (node.sheet) addSheet(node.sheet); return; }
    if (node.nodeName === "LINK" && /stylesheet/i.test(node.rel)) {
      node.addEventListener("load", () => addSheet(node.sheet), { once: true });
      if (node.sheet) { try { if (node.sheet.cssRules.length) addSheet(node.sheet); } catch (_) {} }
    }
  }

  /*
   * Edge + backdrop sweep.
   *
   * Probes a few points along the window edges and across the middle with
   * elementsFromPoint, then writes class-based rules for what it finds:
   *  - big bars touching an edge (title bar, sidebar, bottom bar, frame
   *    border): background -> var(--glass-edge-a), borders/shadows cleared;
   *  - full-window layers with Steam's own CSS background art or colour:
   *    image removed, colour -> glass, so the wallpaper sits on top.
   * Rules key on class names read at runtime, so React re-renders keep them
   * and nothing is hard-coded. ~20 hit tests per sweep; runs on load, after
   * clicks (navigation) and on resize, debounced.
   */
  const WEB = /(^|\.)(steampowered|steamcommunity)\.com$/i.test(location.hostname);
  const SKIP_TAGS = /^(HTML|BODY|IMG|VIDEO|CANVAS|SVG|PATH|BUTTON|INPUT|TEXTAREA|SELECT|IFRAME)$/i;
  const sweepRules = new Map();
  let sweepStyle = null, sweepTimer = 0;

  function selectorFor(el) {
    if (!el.classList || !el.classList.length) return null;
    let s = "";
    for (const c of el.classList) s += "." + CSS.escape(c);
    return s;
  }

  const alphaOf = (c) => {
    RGB.lastIndex = 0;
    const m = RGB.exec(c);
    return m ? (m[4] === undefined ? 1 : parseFloat(m[4])) : 0;
  };
  const rgbOf = (c) => { RGB.lastIndex = 0; const m = RGB.exec(c); return m && `${m[1]}, ${m[2]}, ${m[3]}`; };

  function classify(el, edge, W, H) {
    if (SKIP_TAGS.test(el.tagName) || (el.id && el.id.startsWith(MARK))) return;
    const sel = selectorFor(el);
    if (!sel || sweepRules.has(sel)) return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor, img = cs.backgroundImage;
    const hasBg = alphaOf(bg) > 0.02, hasImg = img && img !== "none";
    const big = r.width * r.height >= W * H * 0.5;
    if (big) {
      // Backdrop layer (covers half the window or more), whichever probe hit it.
      let d = "";
      if (hasImg && isDefaultArt(img)) d += "background-image:none!important;";
      if (hasBg && alphaOf(bg) > 0.5) d += "background-color:var(--glass-bg, var(--glass-key, rgb(1, 14, 22)))!important;";
      if (edge) d += "border-color:transparent!important;box-shadow:none!important;";
      if (d) sweepRules.set(sel, `${sel}{${d}}`);
    } else if (edge) {
      // Bars: span most of one axis. Keeps small edge widgets (icons) solid.
      if (!(r.width >= W * 0.6 || r.height >= H * 0.5)) return;
      if (!hasBg && !hasImg && cs.borderStyle === "none" && cs.boxShadow === "none") return;
      let d = "border-color:transparent!important;box-shadow:none!important;";
      // Bars: tinted by --glass-edge-a over the key colour; 0 = fully clear.
      if (hasBg) d += `background-color:rgba(${rgbOf(bg)}, var(--glass-edge-a, 0))!important;`;
      if (hasImg && isDefaultArt(img)) d += "background-image:none!important;";
      sweepRules.set(sel, `${sel}{${d}}`);
    }
  }

  // Steam's built-in art: gradients, data: URIs and files from the client's
  // own origin. Game artwork (CDN, library cache, custom images) is kept.
  function isDefaultArt(img) {
    // Steam web pages: any half-window background layer is page art (game
    // hero backgrounds such as CS2 on Community). Always remove it.
    if (WEB) return true;
    if (/\/assets\/|librarycache|customimages/i.test(img)) return false;
    const urls = img.match(/url\("?([^")]+)"?\)/g);
    if (!urls) return true; // gradients only
    return urls.every((u) => {
      const href = u.replace(/^url\("?|"?\)$/g, "");
      if (href.startsWith("data:")) return true;
      try { return new URL(href, location.href).host === location.host; } catch (_) { return false; }
    });
  }

  let sweep = function () {
    sweepTimer = 0;
    const W = innerWidth, H = innerHeight;
    if (W < 300 || H < 200) return; // tiny popup windows: leave alone
    const before = sweepRules.size;
    const fr = [0.15, 0.5, 0.85];
    const pts = [];
    for (const f of fr) {
      pts.push([1, H * f, true], [W - 2, H * f, true], [W * f, 1, true], [W * f, H - 2, true]);
      pts.push([W * f, H * 0.35, false], [W * f, H * 0.7, false]);
    }
    for (const [x, y, edge] of pts) {
      for (const el of document.elementsFromPoint(x, y)) classify(el, edge, W, H);
    }
    if (sweepRules.size === before) return;
    if (!sweepStyle) {
      sweepStyle = document.createElement("style");
      sweepStyle.id = `${MARK}-sweep`;
      (document.head || document.documentElement).appendChild(sweepStyle);
    }
    sweepStyle.textContent = Array.from(sweepRules.values()).join("");
  };

  function scheduleSweep(delay) {
    if (sweepTimer) clearTimeout(sweepTimer);
    // No rAF: it pauses while the window is hidden, and hit tests force layout anyway.
    sweepTimer = setTimeout(sweep, delay);
  }

  function start() {
    scanAll();
    for (const t of [400, 1500, 4000]) setTimeout(() => scheduleSweep(0), t);
    addEventListener("click", () => scheduleSweep(700), { passive: true, capture: true });
    addEventListener("resize", () => scheduleSweep(500), { passive: true });
    addEventListener("popstate", () => scheduleSweep(600));
    // Page changes not caused by a click (steam:// links, router, lazy tabs):
    // watch DOM additions, throttled to one sweep per second. A sweep is ~36
    // hit tests on an already laid-out page, about 1-2 ms.
    let lastSweep = 0, lastFound = true;
    const domWatch = new MutationObserver(() => {
      if (sweepTimer) return;
      // 1 s after a sweep that found something new, 3 s after an idle one.
      const gap = lastFound ? 1000 : 3000;
      scheduleSweep(Math.max(400, gap - (performance.now() - lastSweep)));
    });
    const watchRoot = () => domWatch.observe(document.body || document.documentElement, { childList: true, subtree: true });
    if (document.body) watchRoot(); else addEventListener("DOMContentLoaded", watchRoot, { once: true });
    const origSweep = sweep;
    sweep = function () {
      const before = sweepRules.size;
      lastSweep = performance.now();
      origSweep();
      lastFound = sweepRules.size !== before;
    };
    const mo = new MutationObserver((list) => {
      for (const rec of list) for (const n of rec.addedNodes) watchNode(n);
    });
    // childList only (no subtree): React churn inside #root never wakes this.
    if (document.head) mo.observe(document.head, { childList: true });
    if (document.body) mo.observe(document.body, { childList: true });
    // Sheets that finished loading between injection and observe.
    window.addEventListener("load", scanAll, { once: true });
    setTimeout(welcome, 2500);
  }

  /*
   * One-time welcome card in the main Steam window. Dismissed state is kept in
   * this window's localStorage. Shows whether tools/SteamGlass.exe is running
   * (it writes tools/helper-status.json; read once from the theme's own host).
   */
  function welcome() {
    const KEY = "glassDesktop.welcome.v3";
    if (location.hostname !== "steamloopback.host" || innerWidth < 700 || innerHeight < 450) return;
    if (!/^Steam$/.test(document.title || "")) return;
    try { if (localStorage.getItem(KEY)) return; } catch (_) { return; }
    const card = document.createElement("div");
    card.className = "glass-welcome";
    card.setAttribute("role", "dialog");
    card.innerHTML =
      "<h2>Glass Desktop is on</h2>" +
      "<p>Steam is now see-through. Tune it in <b>Millennium &gt; Themes &gt; Glass Desktop &gt; Configure</b>: " +
      "Mode, Transparency %, Glass tint strength and Preset.</p>" +
      "<p>Press <b>Ctrl+Alt+T</b> to turn transparency off for screenshots or screen sharing.</p>" +
      "<div class=\"glass-status\"><i></i><span>Checking helper...</span></div>" +
      "<button type=\"button\">Got it</button>";
    card.querySelector("button").addEventListener("click", () => {
      try { localStorage.setItem(KEY, "1"); } catch (_) {}
      card.remove();
    });
    document.body.appendChild(card);
    const status = card.querySelector(".glass-status");
    const say = (ok, text) => { status.dataset.ok = ok; status.querySelector("span").textContent = text; };
    if (!SELF) { say("unknown", "Helper status unknown."); return; }
    fetch(new URL("../tools/helper-status.json", SELF).href, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && j.running
        ? say(true, "Helper running" + (j.paused ? " (transparency paused)" : "") + ".")
        : say(false, "Helper not running: run tools\\start.ps1 (Steam stays solid dark until then)."))
      .catch(() => say(false, "Helper not running: run tools\\start.ps1 (Steam stays solid dark until then)."));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  // Debug helper for the CEF devtools console.
  window.__glassDesktopStats = () => ({ overrideSheets: overrides, coloursCached: cache.size, pendingJobs: jobs.length, sweepRules: sweepRules.size });
})();
