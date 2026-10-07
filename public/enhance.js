/*
 * EXSTASE – interaktive Extras (ohne Abhängigkeiten).
 * Läuft im Shop (über components/enhance.tsx) und in der Offline-Vorschau.
 * Jede Funktion bindet sich nur einmal pro Element (siehe once()).
 */
(() => {
  const fmtEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const fmtEUR2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const fmtNum = new Intl.NumberFormat("de-DE");
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Merkt sich gebundene Elemente ohne DOM-Attribute – sonst meldet React einen Hydration-Fehler,
  // wenn ein Bereich (z. B. die Produktliste) erst nach diesem Skript hydriert wird.
  const bound = new WeakMap();
  const once = (el, key) => {
    let keys = bound.get(el);
    if (!keys) bound.set(el, (keys = new Set()));
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  };

  const setFill = (input) => {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
  };

  /** Zahlen sanft hochzählen */
  const animateNumber = (el, to, format, dur = 500) => {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (reduced) {
      el.textContent = format(to);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - t) ** 3;
      el.textContent = format(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  function tilt(root) {
    if (!finePointer || reduced) return;
    for (const el of root.querySelectorAll("[data-tilt]")) {
      if (!once(el, "Tilt")) continue;
      const max = Number(el.dataset.tilt || 6);
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transform = "";
      });
    }
  }

  function spotlight(root) {
    if (!finePointer) return;
    for (const el of root.querySelectorAll("[data-spotlight]")) {
      if (!once(el, "Spot")) continue;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    }
  }

  /** Ersparnis-Rechner: Einlagen vs. waschbare Unterwäsche */
  function calculator(root) {
    for (const box of root.querySelectorAll("[data-calc]")) {
      if (!once(box, "Calc")) continue;
      const pads = box.querySelector("[data-calc-pads]");
      const price = box.querySelector("[data-calc-price]");
      const setPrice = Number(box.dataset.setPrice || 79.9);
      const out = (k) => box.querySelector(`[data-out="${k}"]`);
      const update = () => {
        setFill(pads);
        setFill(price);
        const perDay = Number(pads.value);
        const p = Number(price.value);
        const perYear = perDay * 365;
        const costYear = perYear * p;
        const months = setPrice / (costYear / 12);
        out("pads").textContent = String(perDay);
        out("price").textContent = fmtEUR2.format(p);
        animateNumber(out("pads-year"), perYear, (v) => fmtNum.format(Math.round(v)));
        animateNumber(out("cost-year"), costYear, (v) => fmtEUR.format(v));
        animateNumber(out("months"), months, (v) => (v < 1 ? "< 1" : fmtNum.format(Math.max(1, Math.round(v)))));
        const bar = out("bar");
        if (bar) bar.style.width = `${Math.min(100, (setPrice / costYear) * 100)}%`;
      };
      pads.addEventListener("input", update);
      price.addEventListener("input", update);
      update();
    }
  }

  /** Größenfinder: Taillenumfang → Größe */
  function sizeFinder(root) {
    for (const box of root.querySelectorAll("[data-sizefinder]")) {
      if (!once(box, "Size")) continue;
      const input = box.querySelector("[data-waist]");
      const sizes = JSON.parse(box.dataset.sizefinder);
      const update = () => {
        setFill(input);
        const w = Number(input.value);
        const hit = sizes.find(([, min, max]) => w >= min && w <= max) ?? (w < sizes[0][1] ? sizes[0] : sizes[sizes.length - 1]);
        box.querySelector('[data-out="waist"]').textContent = `${w} cm`;
        const out = box.querySelector('[data-out="size"]');
        if (out.textContent !== hit[0]) {
          out.textContent = hit[0];
          if (!reduced) out.animate([{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 350, easing: "cubic-bezier(.22,1,.36,1)" });
        }
        for (const row of box.querySelectorAll("[data-size-row]")) {
          row.dataset.active = row.dataset.sizeRow === hit[0] ? "true" : "false";
        }
      };
      input.addEventListener("input", update);
      update();
    }
  }

  /** Story-Leiste: Pfeile scrollen eine Karte weiter */
  function reel(root) {
    for (const box of root.querySelectorAll("[data-reel]")) {
      if (!once(box, "Reel")) continue;
      const track = box.querySelector("[data-reel-track]");
      const by = (dir) => {
        const card = track.firstElementChild;
        const w = card ? card.getBoundingClientRect().width + 16 : 320;
        track.scrollBy({ left: dir * w, behavior: "smooth" });
      };
      box.querySelector("[data-reel-prev]")?.addEventListener("click", () => by(-1));
      box.querySelector("[data-reel-next]")?.addEventListener("click", () => by(1));
    }
  }

  /**
   * Videos nur abspielen, wenn sichtbar (spart Akku & Daten) – und nie bei „Bewegung reduzieren“
   * (dann bleibt das Vorschaubild stehen). Im Slider entscheidet dessen Pause-Schalter (startet dort bei
   * „Bewegung reduzieren“ angehalten und kann bewusst fortgesetzt werden).
   */
  function videos(root) {
    const vids = [...root.querySelectorAll("video[data-autoplay]")].filter((v) => once(v, "Vid"));
    if (!vids.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target;
          const slide = v.closest("[data-slide]");
          const allowed = slide
            ? slide.classList.contains("is-active") && !v.closest("[data-slider]")?.classList.contains("is-stopped")
            : !reduced;
          if (e.isIntersecting && allowed) v.play?.().catch(() => {});
          else v.pause?.();
        }
      },
      { threshold: 0.15 }
    );
    for (const v of vids) io.observe(v);
  }

  /** Video mit eigenem Play-Button und Kapiteln */
  function videoPlayer(root) {
    for (const box of root.querySelectorAll("[data-video]")) {
      if (!once(box, "Video")) continue;
      const video = box.querySelector("[data-video-el]");
      const overlay = box.querySelector("[data-video-play]");
      const chapters = [...box.querySelectorAll("[data-seek]")];
      const start = (t) => {
        if (overlay) overlay.hidden = true;
        if (typeof t === "number") video.currentTime = t;
        video.play?.().catch(() => {});
      };
      overlay?.addEventListener("click", () => start());
      for (const c of chapters) c.addEventListener("click", () => start(Number(c.dataset.seek)));
      video.addEventListener("timeupdate", () => {
        let active = chapters[0];
        for (const c of chapters) if (video.currentTime >= Number(c.dataset.seek)) active = c;
        for (const c of chapters) c.dataset.active = c === active && !video.paused ? "true" : "false";
      });
      video.addEventListener("play", () => {
        if (overlay) overlay.hidden = true;
      });
    }
  }

  /** Zahlen zählen beim Hineinscrollen hoch */
  function counters(root) {
    const els = [...root.querySelectorAll("[data-count-to]")].filter((el) => once(el, "Count"));
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const to = Number(e.target.dataset.countTo);
          e.target.dataset.value = "0";
          animateNumber(e.target, to, (v) => fmtNum.format(Math.round(v)), 1400);
        }
      },
      { threshold: 0.6 }
    );
    for (const el of els) {
      if (!reduced) el.textContent = "0";
      io.observe(el);
    }
  }

  /** Icons zeichnen sich, sobald sie sichtbar werden */
  let iconObserver;
  function drawIcons(root) {
    document.documentElement.classList.add("tt-js");
    const els = [...root.querySelectorAll(".icon-draw")].filter((el) => once(el, "Draw"));
    if (!("IntersectionObserver" in window)) {
      for (const el of els) el.classList.add("is-drawn");
      return;
    }
    iconObserver ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-drawn");
            iconObserver.unobserve(e.target);
          }
        }
      },
      { threshold: 0.4 }
    );
    for (const el of els) iconObserver.observe(el);
  }

  /**
   * Hero-Slider: Autoplay, Pfeile, Punkte, Wischen, Tastatur, Pause bei Hover/Fokus/unsichtbarem Tab.
   * Pause-Schalter [data-slider-toggle] hält Weiterblättern, Videos und Endlos-Animationen an (WCAG 2.2.2);
   * bei „Bewegung reduzieren“ startet der Slider angehalten.
   */
  function slider(root) {
    for (const box of root.querySelectorAll("[data-slider]")) {
      if (!once(box, "Slider")) continue;
      const slides = [...box.querySelectorAll("[data-slide]")];
      const dots = [...box.querySelectorAll("[data-slider-dot]")];
      if (slides.length < 2) continue;
      const toggle = box.querySelector("[data-slider-toggle]");
      const live = box.querySelector("[data-slider-live]");
      const loops = box.querySelectorAll(".anim-bob, .anim-blob, .anim-ripple, .slide-drop, .animate-pulse");
      const interval = Number(box.dataset.interval || 6500);
      box.style.setProperty("--slider-interval", `${interval}ms`);
      let index = Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")));
      let timer;
      let hovering = false; // Maus oder Fokus im Slider → kurz anhalten
      let stopped = reduced; // per Schalter angehalten

      // Slider (teilweise) im Bild? Sonst Videos nicht starten – das übernimmt videos(), sobald er sichtbar wird.
      const inView = () => {
        const r = box.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      };
      const sync = () => {
        box.classList.toggle("is-paused", stopped || hovering);
        box.classList.toggle("is-stopped", stopped);
        // Wechsel nur vorlesen, wenn nicht automatisch weitergeblättert wird
        live?.setAttribute("aria-live", stopped || hovering ? "polite" : "off");
        toggle?.setAttribute("aria-label", stopped ? "Automatisches Weiterblättern fortsetzen" : "Automatisches Weiterblättern pausieren");
        for (const el of loops) el.style.animationPlayState = stopped ? "paused" : "";
      };

      const show = (i) => {
        index = (i + slides.length) % slides.length;
        const play = !stopped && inView();
        slides.forEach((s, k) => {
          const on = k === index;
          s.classList.toggle("is-active", on);
          s.setAttribute("aria-hidden", on ? "false" : "true");
          for (const el of s.querySelectorAll("a, button")) el.tabIndex = on ? 0 : -1;
          for (const v of s.querySelectorAll("video")) {
            if (on && play) v.play?.().catch(() => {});
            else v.pause?.();
          }
        });
        dots.forEach((d, k) => {
          d.classList.remove("is-active");
          // Angehalten: aktueller Punkt voll statt laufendem Fortschritt
          d.classList.toggle("is-done", k < index || (stopped && k === index));
          d.setAttribute("aria-current", k === index ? "true" : "false");
        });
        // Fortschritts-Animation neu starten
        const dot = dots[index];
        if (dot && !stopped) {
          void dot.offsetWidth;
          dot.classList.add("is-active");
        }
        schedule();
      };
      const schedule = () => {
        clearTimeout(timer);
        if (stopped || hovering || document.hidden) return;
        timer = setTimeout(() => show(index + 1), interval);
      };
      const pause = (on) => {
        hovering = on;
        sync();
        if (on) clearTimeout(timer);
        else schedule();
      };
      const setStopped = (on) => {
        stopped = on;
        // Ausdrücklich fortgesetzt → gilt sofort, auch wenn Maus/Fokus noch auf dem Schalter liegen
        if (!on) hovering = false;
        sync();
        if (on) {
          clearTimeout(timer);
          for (const v of box.querySelectorAll("video")) v.pause?.();
        } else show(index);
      };

      toggle?.addEventListener("click", () => setStopped(!stopped));
      box.querySelector("[data-slider-next]")?.addEventListener("click", () => show(index + 1));
      box.querySelector("[data-slider-prev]")?.addEventListener("click", () => show(index - 1));
      dots.forEach((d, k) => d.addEventListener("click", () => show(k)));
      if (finePointer) {
        box.addEventListener("pointerenter", () => pause(true));
        box.addEventListener("pointerleave", () => pause(false));
      }
      box.addEventListener("focusin", () => pause(true));
      box.addEventListener("focusout", () => pause(false));
      box.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") show(index + 1);
        if (e.key === "ArrowLeft") show(index - 1);
      });
      document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : schedule()));

      // Wischen auf Touch-Geräten
      let x0 = null;
      let y0 = null;
      const vp = box.querySelector("[data-slider-viewport]") ?? box;
      vp.addEventListener("touchstart", (e) => {
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
      }, { passive: true });
      vp.addEventListener("touchend", (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
        x0 = null;
      });

      sync();
      show(index);
    }
  }

  /** Sektionen außerhalb des Bildschirms: Animationen pausieren */
  let offObserver;
  function offscreen(root) {
    if (!("IntersectionObserver" in window)) return;
    const els = [...root.querySelectorAll("main > section, main > div, footer, [data-pause-offscreen]")].filter((el) => once(el, "Off"));
    offObserver ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.removeAttribute("data-offscreen");
          else e.target.setAttribute("data-offscreen", "");
        }
      },
      { rootMargin: "200px 0px" }
    );
    for (const el of els) offObserver.observe(el);
  }

  window.ttEnhance = (root = document) => {
    offscreen(root);
    slider(root);
    drawIcons(root);
    counters(root);
    videoPlayer(root);
    tilt(root);
    spotlight(root);
    calculator(root);
    sizeFinder(root);
    reel(root);
    videos(root);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.ttEnhance());
  else window.ttEnhance();
})();
