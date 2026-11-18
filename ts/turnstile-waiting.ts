export interface TurnstileWaitingOptions {
  formSelector?: string;
  tickerSelector?: string;
  submitSelector?: string;
  tipsUrl?: string;
  introMessage?: string;
  badgeMessage?: string;
  defaultReadyText?: string;
  typeSpeedMs?: number;
  holdMs?: number;
  introHoldMs?: number;
  badgeHoldMs?: number;
  pollIntervalMs?: number;
  autoReleaseMemory?: boolean;
}

interface TickerState {
  runId: number;
  timer: ReturnType<typeof setTimeout> | null;
  mode: "idle" | "waiting" | "ready";
  lastIdx: number;
  pendingReady: boolean;
  phase: "idle" | "typing" | "holding" | "badge" | "ready";
  holdStart: number;
  holdExitFn: (() => void) | null;
  onReady: (() => void) | null;
}

export class TurnstileWaitingController {
  private readonly opts: Required<TurnstileWaitingOptions>;
  private readonly tickerStates = new WeakMap<Element, TickerState>();
  private tipsCache: string[] | null = null;
  private tipsPromise: Promise<string[] | null> | null = null;
  private tipsAbort: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private observer: MutationObserver | null = null;
  private readonly onPageHide = () => this.releaseMemory();

  constructor(options: TurnstileWaitingOptions = {}) {
    this.opts = {
      formSelector: options.formSelector ?? "form[data-tw-form], form[data-form]",
      tickerSelector: options.tickerSelector ?? ".tw-ticker, .auth-turnstile-ticker",
      submitSelector: options.submitSelector ?? "button[type=submit], input[type=submit]",
      tipsUrl: options.tipsUrl ?? "./data/auth-cyber-tips.json",
      introMessage:
        options.introMessage ??
        "Bersabarlah, sebelum ke sana, kami memastikan koneksi aman dan tidak ada penyusup!",
      badgeMessage: options.badgeMessage ?? "Tahukah Anda!",
      defaultReadyText: options.defaultReadyText ?? "siap lanjut!",
      typeSpeedMs: options.typeSpeedMs ?? 65,
      holdMs: options.holdMs ?? 8500,
      introHoldMs: options.introHoldMs ?? 3500,
      badgeHoldMs: options.badgeHoldMs ?? 3200,
      pollIntervalMs: options.pollIntervalMs ?? 350,
      autoReleaseMemory: options.autoReleaseMemory ?? true,
    };
  }

  public start(): void {
    this.sync();
    if (typeof MutationObserver !== "undefined" && !this.observer) {
      this.observer = new MutationObserver(() => this.sync());
      this.getForms().forEach((form) => {
        this.observer?.observe(form, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["value", "class", "style", "hidden"],
        });
      });
    }
    if (!this.pollTimer && this.opts.pollIntervalMs > 0) {
      this.pollTimer = setInterval(() => this.sync(), this.opts.pollIntervalMs);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide);
    }
  }

  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.getForms().forEach((f) => {
      const ticker = f.querySelector(this.opts.tickerSelector);
      if (ticker) this.stopTicker(ticker);
    });
    this.releaseMemory();
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide);
    }
  }

  public releaseMemory(): void {
    if (this.tipsAbort) {
      try {
        this.tipsAbort.abort();
      } catch {
        // ignore abort error
      }
      this.tipsAbort = null;
    }
    this.tipsPromise = null;
    if (Array.isArray(this.tipsCache)) {
      this.tipsCache.length = 0;
    }
    this.tipsCache = null;
  }

  public sync(): void {
    let anyWaiting = false;
    for (const form of this.getForms()) {
      const cf = form.querySelector(".cf-turnstile");
      if (!cf) continue;
      const btn = form.querySelector<HTMLButtonElement | HTMLInputElement>(this.opts.submitSelector);
      const inp = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
      const ready = Boolean(inp && inp.value && inp.value.trim().length > 0);
      if (btn) {
        btn.disabled = !ready;
        btn.setAttribute("aria-disabled", ready ? "false" : "true");
      }
      const ticker = form.querySelector(this.opts.tickerSelector);
      if (!ticker) continue;
      if (this.isFormVisible(form)) {
        if (ready) {
          this.showReadyState(ticker);
        } else {
          anyWaiting = true;
          this.startTipsSequence(ticker);
        }
      } else {
        const st = this.tickerStates.get(ticker);
        if (st && st.mode !== "idle") {
          this.stopTicker(ticker);
          st.mode = "idle";
        }
      }
    }
    if (!anyWaiting && this.opts.autoReleaseMemory && !this.hasWaitingTicker()) {
      this.releaseMemory();
    }
  }

  private getForms(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(this.opts.formSelector));
  }

  private isFormVisible(form: HTMLElement): boolean {
    return Boolean(form.offsetWidth || form.offsetHeight || form.getClientRects().length);
  }

  private hasWaitingTicker(): boolean {
    for (const form of this.getForms()) {
      const ticker = form.querySelector(this.opts.tickerSelector);
      const st = ticker ? this.tickerStates.get(ticker) : undefined;
      if (st?.mode === "waiting") return true;
    }
    return false;
  }

  private loadTips(): Promise<string[] | null> {
    if (Array.isArray(this.tipsCache) && this.tipsCache.length) {
      return Promise.resolve(this.tipsCache);
    }
    if (this.tipsPromise) return this.tipsPromise;
    this.tipsAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    const init: RequestInit = this.tipsAbort
      ? { signal: this.tipsAbort.signal, credentials: "same-origin" }
      : { credentials: "same-origin" };
    this.tipsPromise = fetch(this.opts.tipsUrl, init)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        this.tipsPromise = null;
        this.tipsAbort = null;
        if (Array.isArray(data) && data.length && (!this.opts.autoReleaseMemory || this.hasWaitingTicker())) {
          this.tipsCache = data.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
          return this.tipsCache;
        }
        return null;
      })
      .catch(() => {
        this.tipsPromise = null;
        this.tipsAbort = null;
        return null;
      });
    return this.tipsPromise;
  }

  private ensureSlot(ticker: Element): HTMLElement {
    let slot = ticker.querySelector<HTMLElement>(".tw-slot, .att-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "tw-slot att-slot";
      ticker.appendChild(slot);
    }
    return slot;
  }

  private getState(ticker: Element): TickerState {
    let st = this.tickerStates.get(ticker);
    if (!st) {
      st = { runId: 0, timer: null, mode: "idle", lastIdx: -1, pendingReady: false, phase: "idle", holdStart: 0, holdExitFn: null, onReady: null };
      this.tickerStates.set(ticker, st);
    }
    return st;
  }

  private stopTicker(ticker: Element): void {
    const st = this.tickerStates.get(ticker);
    if (!st) return;
    st.runId++;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }
  }

  private makeBadgeHtml(text: string, isReady: boolean): string {
    const idx = text.lastIndexOf("!");
    const body = idx >= 0 ? text.slice(0, idx) : text;
    const bang = idx >= 0 ? '<span class="tw-bang att-bang">!</span>' : "";
    return `<span class="tw-badge att-badge${isReady ? " is-ready" : ""} tw-enter-right att-enter-right">${body}${bang}</span>`;
  }

  private slideOutCurrent(slot: HTMLElement, cb: () => void): void {
    const cur = slot.firstElementChild;
    if (!cur) {
      cb();
      return;
    }
    cur.classList.remove("tw-enter-right", "att-enter-right", "tw-center", "att-center");
    cur.classList.add("tw-exit-left", "att-exit-left");
    setTimeout(cb, 1050);
  }

  private showBadge(slot: HTMLElement, text: string, isReady: boolean, runId: number, st: TickerState, afterMs: number, nextFn: (() => void) | null): void {
    if (st.runId !== runId) return;
    st.phase = "badge";
    slot.innerHTML = this.makeBadgeHtml(text, isReady);
    const el = slot.firstElementChild;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (st.runId !== runId || !el) return;
        el.classList.remove("tw-enter-right", "att-enter-right");
        el.classList.add("tw-center", "att-center");
      });
    });
    if (nextFn) {
      st.timer = setTimeout(() => {
        if (st.runId !== runId) return;
        this.slideOutCurrent(slot, () => {
          if (st.runId !== runId) return;
          if (st.pendingReady && st.onReady) st.onReady();
          else nextFn();
        });
      }, afterMs);
    }
  }

  private fadeInText(slot: HTMLElement, text: string, runId: number, st: TickerState, holdMs: number, nextFn: () => void): void {
    if (st.runId !== runId) return;
    st.phase = "holding";
    st.holdStart = Date.now();
    slot.innerHTML = '<span class="tw-text att-text tw-fade-start att-fade-start"></span>';
    const el = slot.firstElementChild;
    if (el) el.textContent = text;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (st.runId !== runId || !el) return;
        el.classList.remove("tw-fade-start", "att-fade-start");
        el.classList.add("tw-center", "att-center");
      });
    });
    st.holdExitFn = () => {
      this.slideOutCurrent(slot, () => {
        if (st.runId !== runId) return;
        if (st.pendingReady && st.onReady) st.onReady();
        else nextFn();
      });
    };
    st.timer = setTimeout(() => {
      if (st.runId !== runId) return;
      st.holdExitFn?.();
    }, st.pendingReady ? 5000 : holdMs);
  }

  private typeText(slot: HTMLElement, text: string, speed: number, runId: number, st: TickerState, holdMs: number, nextFn: () => void): void {
    if (st.runId !== runId) return;
    st.phase = "typing";
    slot.innerHTML = '<span class="tw-text att-text tw-center att-center"><span class="tw-typed att-typed"></span><span class="tw-cursor att-cursor" aria-hidden="true"></span></span>';
    const typedEl = slot.querySelector<HTMLElement>(".tw-typed");
    let i = 0;

    const scheduleHoldExit = (waitMs: number) => {
      st.timer = setTimeout(() => {
        if (st.runId !== runId) return;
        this.slideOutCurrent(slot, () => {
          if (st.runId !== runId) return;
          if (st.pendingReady && st.onReady) st.onReady();
          else nextFn();
        });
      }, waitMs);
    };

    const step = () => {
      if (st.runId !== runId || !typedEl) return;
      if (i < text.length) {
        typedEl.textContent += text.charAt(i++);
        st.timer = setTimeout(step, speed);
      } else {
        const cur = slot.querySelector<HTMLElement>(".tw-cursor");
        if (cur) cur.style.display = "none";
        st.phase = "holding";
        st.holdStart = Date.now();
        st.holdExitFn = () => {
          this.slideOutCurrent(slot, () => {
            if (st.runId !== runId) return;
            if (st.pendingReady && st.onReady) st.onReady();
            else nextFn();
          });
        };
        scheduleHoldExit(st.pendingReady ? 5000 : holdMs);
      }
    };
    step();
  }

  private renderReadyBadgeNow(ticker: Element): void {
    const slot = this.ensureSlot(ticker);
    const st = this.getState(ticker);
    this.stopTicker(ticker);
    st.mode = "ready";
    st.pendingReady = false;
    st.phase = "ready";
    if (this.opts.autoReleaseMemory && !this.hasWaitingTicker()) {
      this.releaseMemory();
    }
    const runId = ++st.runId;
    const readyText = ticker.getAttribute("data-ready-text") || this.opts.defaultReadyText;
    this.slideOutCurrent(slot, () => {
      this.showBadge(slot, readyText, true, runId, st, 0, null);
    });
  }

  private startTipsSequence(ticker: Element): void {
    const slot = this.ensureSlot(ticker);
    const st = this.getState(ticker);
    if (st.mode === "waiting") return;
    this.stopTicker(ticker);
    st.mode = "waiting";
    st.pendingReady = false;
    st.onReady = () => this.renderReadyBadgeNow(ticker);
    const runId = ++st.runId;
    void this.loadTips();

    const pickAndType = (list: string[] | null) => {
      if (st.runId !== runId || st.mode !== "waiting") return;
      const tips = Array.isArray(list) && list.length ? list : [this.opts.introMessage];
      let idx = Math.floor(Math.random() * tips.length);
      if (tips.length > 1 && idx === st.lastIdx) idx = (idx + 1) % tips.length;
      st.lastIdx = idx;
      this.typeText(slot, tips[idx], this.opts.typeSpeedMs, runId, st, this.opts.holdMs, nextRandomTip);
    };

    const nextRandomTip = () => {
      if (st.runId !== runId || st.mode !== "waiting") return;
      if (Array.isArray(this.tipsCache) && this.tipsCache.length) {
        pickAndType(this.tipsCache);
      } else {
        void this.loadTips().then(pickAndType);
      }
    };

    this.fadeInText(slot, this.opts.introMessage, runId, st, this.opts.introHoldMs, () => {
      this.showBadge(slot, this.opts.badgeMessage, false, runId, st, this.opts.badgeHoldMs, nextRandomTip);
    });
  }

  private showReadyState(ticker: Element): void {
    const st = this.tickerStates.get(ticker);
    if (!st || st.mode === "idle") {
      this.renderReadyBadgeNow(ticker);
      return;
    }
    if (st.mode === "ready" || st.pendingReady) return;
    st.pendingReady = true;
    st.onReady = () => this.renderReadyBadgeNow(ticker);
    if (st.phase === "holding" && st.holdExitFn) {
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      const remaining = Math.max(0, 5000 - (Date.now() - (st.holdStart || Date.now())));
      st.timer = setTimeout(st.holdExitFn, remaining);
    }
  }
}

export function initTurnstileWaiting(options?: TurnstileWaitingOptions): TurnstileWaitingController {
  const controller = new TurnstileWaitingController(options);
  controller.start();
  return controller;
}
