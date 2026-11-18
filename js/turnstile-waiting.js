(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TurnstileWaiting = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_INTRO = "Bersabarlah, sebelum ke sana, kami memastikan koneksi aman dan tidak ada penyusup!";
  var DEFAULT_BADGE = "Tahukah Anda!";
  var DEFAULT_READY = "siap lanjut!";

  function createController(options) {
    var opts = Object.assign({
      formSelector: "form[data-tw-form], form[data-form]",
      tickerSelector: ".tw-ticker, .auth-turnstile-ticker",
      submitSelector: "button[type=submit], input[type=submit]",
      tipsUrl: "./data/auth-cyber-tips.json",
      introMessage: DEFAULT_INTRO,
      badgeMessage: DEFAULT_BADGE,
      defaultReadyText: DEFAULT_READY,
      typeSpeedMs: 65,
      holdMs: 8500,
      introHoldMs: 3500,
      badgeHoldMs: 3200,
      pollIntervalMs: 350,
      autoReleaseMemory: true
    }, options || {});

    var tickerStates = new WeakMap();
    var tipsCache = null;
    var tipsPromise = null;
    var tipsAbort = null;
    var pollTimer = null;
    var observer = null;

    function getForms() {
      return Array.prototype.slice.call(document.querySelectorAll(opts.formSelector));
    }

    function hasWaitingTicker() {
      var forms = getForms();
      for (var i = 0; i < forms.length; i++) {
        var t = forms[i].querySelector(opts.tickerSelector);
        if (t) {
          var st = tickerStates.get(t);
          if (st && st.mode === "waiting") return true;
        }
      }
      return false;
    }

    function releaseMemory() {
      if (tipsAbort) {
        try { tipsAbort.abort(); } catch (e) {}
        tipsAbort = null;
      }
      tipsPromise = null;
      if (Array.isArray(tipsCache)) {
        tipsCache.length = 0;
      }
      tipsCache = null;
      if (typeof window !== "undefined" && typeof window.AYOKE_CYBER_TIPS !== "undefined") {
        try { delete window.AYOKE_CYBER_TIPS; } catch (e) { window.AYOKE_CYBER_TIPS = null; }
      }
    }

    function loadTips() {
      if (Array.isArray(tipsCache) && tipsCache.length) {
        return Promise.resolve(tipsCache);
      }
      if (tipsPromise) return tipsPromise;
      tipsAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
      var fetchOpts = tipsAbort ? { signal: tipsAbort.signal, credentials: "same-origin" } : { credentials: "same-origin" };
      tipsPromise = fetch(opts.tipsUrl, fetchOpts)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          tipsPromise = null;
          tipsAbort = null;
          if (Array.isArray(data) && data.length && (!opts.autoReleaseMemory || hasWaitingTicker())) {
            tipsCache = data;
            return tipsCache;
          }
          return null;
        })
        .catch(function () {
          tipsPromise = null;
          tipsAbort = null;
          return null;
        });
      return tipsPromise;
    }

    function ensureSlot(ticker) {
      var slot = ticker.querySelector(".tw-slot, .att-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "tw-slot att-slot";
        ticker.appendChild(slot);
      }
      return slot;
    }

    function getState(ticker) {
      var st = tickerStates.get(ticker);
      if (!st) {
        st = { runId: 0, timer: null, mode: "idle", lastIdx: -1, pendingReady: false, phase: "idle", holdStart: 0, holdExitFn: null, onReady: null };
        tickerStates.set(ticker, st);
      }
      return st;
    }

    function stopTicker(ticker) {
      var st = tickerStates.get(ticker);
      if (!st) return;
      st.runId++;
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
    }

    function makeBadgeHtml(text, isReady) {
      var idx = text.lastIndexOf("!");
      var body = idx >= 0 ? text.slice(0, idx) : text;
      var bang = idx >= 0 ? '<span class="tw-bang att-bang">!</span>' : "";
      return '<span class="tw-badge att-badge' + (isReady ? " is-ready" : "") + ' tw-enter-right att-enter-right">' + body + bang + "</span>";
    }

    function slideOutCurrent(slot, cb) {
      var cur = slot.firstElementChild;
      if (!cur) { cb(); return; }
      cur.classList.remove("tw-enter-right", "att-enter-right", "tw-center", "att-center");
      cur.classList.add("tw-exit-left", "att-exit-left");
      setTimeout(cb, 1050);
    }

    function showBadge(slot, text, isReady, runId, st, afterMs, nextFn) {
      if (st.runId !== runId) return;
      st.phase = "badge";
      slot.innerHTML = makeBadgeHtml(text, isReady);
      var el = slot.firstElementChild;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (st.runId !== runId) return;
          el.classList.remove("tw-enter-right", "att-enter-right");
          el.classList.add("tw-center", "att-center");
        });
      });
      if (nextFn) {
        st.timer = setTimeout(function () {
          if (st.runId !== runId) return;
          slideOutCurrent(slot, function () {
            if (st.runId !== runId) return;
            if (st.pendingReady && st.onReady) st.onReady();
            else nextFn();
          });
        }, afterMs);
      }
    }

    function fadeInText(slot, text, runId, st, holdMs, nextFn) {
      if (st.runId !== runId) return;
      st.phase = "holding";
      st.holdStart = Date.now();
      slot.innerHTML = '<span class="tw-text att-text tw-fade-start att-fade-start"></span>';
      var el = slot.firstElementChild;
      el.textContent = text;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (st.runId !== runId) return;
          el.classList.remove("tw-fade-start", "att-fade-start");
          el.classList.add("tw-center", "att-center");
        });
      });
      st.holdExitFn = function () {
        slideOutCurrent(slot, function () {
          if (st.runId !== runId) return;
          if (st.pendingReady && st.onReady) st.onReady();
          else nextFn();
        });
      };
      st.timer = setTimeout(function () {
        if (st.runId !== runId) return;
        st.holdExitFn();
      }, st.pendingReady ? 5000 : holdMs);
    }

    function typeText(slot, text, speed, runId, st, holdMs, nextFn) {
      if (st.runId !== runId) return;
      st.phase = "typing";
      slot.innerHTML = '<span class="tw-text att-text tw-center att-center"><span class="tw-typed att-typed"></span><span class="tw-cursor att-cursor" aria-hidden="true"></span></span>';
      var typedEl = slot.querySelector(".tw-typed");
      var i = 0;

      function scheduleHoldExit(waitMs) {
        st.timer = setTimeout(function () {
          if (st.runId !== runId) return;
          slideOutCurrent(slot, function () {
            if (st.runId !== runId) return;
            if (st.pendingReady && st.onReady) st.onReady();
            else nextFn();
          });
        }, waitMs);
      }

      function step() {
        if (st.runId !== runId) return;
        if (i < text.length) {
          typedEl.textContent += text.charAt(i++);
          st.timer = setTimeout(step, speed);
        } else {
          var cur = slot.querySelector(".tw-cursor");
          if (cur) cur.style.display = "none";
          st.phase = "holding";
          st.holdStart = Date.now();
          st.holdExitFn = function () {
            slideOutCurrent(slot, function () {
              if (st.runId !== runId) return;
              if (st.pendingReady && st.onReady) st.onReady();
              else nextFn();
            });
          };
          scheduleHoldExit(st.pendingReady ? 5000 : holdMs);
        }
      }
      step();
    }

    function renderReadyBadgeNow(ticker) {
      var slot = ensureSlot(ticker);
      var st = getState(ticker);
      stopTicker(ticker);
      st.mode = "ready";
      st.pendingReady = false;
      st.phase = "ready";
      if (opts.autoReleaseMemory && !hasWaitingTicker()) releaseMemory();
      var runId = ++st.runId;
      var readyText = ticker.getAttribute("data-ready-text") || opts.defaultReadyText;
      slideOutCurrent(slot, function () {
        showBadge(slot, readyText, true, runId, st, 0, null);
      });
    }

    function startTipsSequence(ticker) {
      var slot = ensureSlot(ticker);
      var st = getState(ticker);
      if (st.mode === "waiting") return;
      stopTicker(ticker);
      st.mode = "waiting";
      st.pendingReady = false;
      st.onReady = function () { renderReadyBadgeNow(ticker); };
      var runId = ++st.runId;
      loadTips();

      function pickAndType(list) {
        if (st.runId !== runId || st.mode !== "waiting") return;
        var tips = Array.isArray(list) && list.length ? list : [opts.introMessage];
        var idx = Math.floor(Math.random() * tips.length);
        if (tips.length > 1 && idx === st.lastIdx) idx = (idx + 1) % tips.length;
        st.lastIdx = idx;
        typeText(slot, tips[idx], opts.typeSpeedMs, runId, st, opts.holdMs, nextRandomTip);
      }

      function nextRandomTip() {
        if (st.runId !== runId || st.mode !== "waiting") return;
        if (Array.isArray(tipsCache) && tipsCache.length) {
          pickAndType(tipsCache);
        } else {
          loadTips().then(pickAndType);
        }
      }

      fadeInText(slot, opts.introMessage, runId, st, opts.introHoldMs, function () {
        showBadge(slot, opts.badgeMessage, false, runId, st, opts.badgeHoldMs, nextRandomTip);
      });
    }

    function showReadyState(ticker) {
      var st = tickerStates.get(ticker);
      if (!st || st.mode === "idle") {
        renderReadyBadgeNow(ticker);
        return;
      }
      if (st.mode === "ready" || st.pendingReady) return;
      st.pendingReady = true;
      st.onReady = function () { renderReadyBadgeNow(ticker); };
      if (st.phase === "holding" && st.holdExitFn) {
        if (st.timer) { clearTimeout(st.timer); st.timer = null; }
        var remaining = Math.max(0, 5000 - (Date.now() - (st.holdStart || Date.now())));
        st.timer = setTimeout(st.holdExitFn, remaining);
      }
    }

    function isFormVisible(form) {
      return !!(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
    }

    function sync() {
      var forms = getForms();
      var anyWaiting = false;
      forms.forEach(function (f) {
        var cf = f.querySelector(".cf-turnstile");
        var btn = f.querySelector(opts.submitSelector);
        if (!cf) return;
        var inp = f.querySelector('input[name="cf-turnstile-response"]');
        var ready = !!(inp && inp.value && inp.value.trim().length > 0);
        if (btn) {
          btn.disabled = !ready;
          btn.setAttribute("aria-disabled", ready ? "false" : "true");
        }
        var ticker = f.querySelector(opts.tickerSelector);
        if (!ticker) return;
        if (isFormVisible(f)) {
          if (ready) {
            showReadyState(ticker);
          } else {
            anyWaiting = true;
            startTipsSequence(ticker);
          }
        } else {
          var st = tickerStates.get(ticker);
          if (st && st.mode !== "idle") {
            stopTicker(ticker);
            st.mode = "idle";
          }
        }
      });
      if (!anyWaiting && opts.autoReleaseMemory && !hasWaitingTicker()) {
        releaseMemory();
      }
    }

    function start() {
      sync();
      if (typeof MutationObserver !== "undefined" && !observer) {
        observer = new MutationObserver(sync);
        getForms().forEach(function (f) {
          observer.observe(f, { childList: true, subtree: true, attributes: true, attributeFilter: ["value", "class", "style", "hidden"] });
        });
      }
      if (!pollTimer && opts.pollIntervalMs > 0) {
        pollTimer = setInterval(sync, opts.pollIntervalMs);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("pagehide", releaseMemory);
      }
    }

    function destroy() {
      if (observer) { observer.disconnect(); observer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      getForms().forEach(function (f) {
        var t = f.querySelector(opts.tickerSelector);
        if (t) stopTicker(t);
      });
      releaseMemory();
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", releaseMemory);
      }
    }

    return {
      start: start,
      sync: sync,
      destroy: destroy,
      releaseMemory: releaseMemory
    };
  }

  return {
    create: createController,
    init: function (options) {
      var ctrl = createController(options);
      ctrl.start();
      return ctrl;
    }
  };
}));
