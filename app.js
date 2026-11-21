(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    setupView: $("#setupView"), timerView: $("#timerView"), doneView: $("#doneView"),
    rounds: $("#rounds"), workTime: $("#workTime"), restTime: $("#restTime"), prepareTime: $("#prepareTime"),
    totalDuration: $("#totalDuration"), startBtn: $("#startBtn"), pauseBtn: $("#pauseBtn"), skipBtn: $("#skipBtn"), stopBtn: $("#stopBtn"), againBtn: $("#againBtn"),
    soundToggle: $("#soundToggle"), roundCounter: $("#roundCounter"), timerPanel: $("#timerPanel"), phaseMessage: $("#phaseMessage"), phaseLabel: $("#phaseLabel"), timerDisplay: $("#timerDisplay"), phaseProgressBar: $("#phaseProgressBar"), nextLine: $("#nextLine"), alertBanner: $("#alertBanner"), wakeStatus: $("#wakeStatus"), doneSummary: $("#doneSummary"), installHint: $("#installHint")
  };

  const state = {
    config: null,
    phase: "idle",
    round: 1,
    phaseDuration: 0,
    phaseEndsAt: 0,
    pausedRemaining: 0,
    paused: false,
    interval: null,
    lastRenderedSecond: null,
    lastFiveAlertSecond: null,
    sound: true,
    audioCtx: null,
    wakeLock: null,
    deferredInstallPrompt: null
  };

  const PHASES = {
    ready: { label: "GET READY", message: "GET READY!", className: "phase-ready" },
    work: { label: "WORK", message: "LET'S GO!", className: "phase-work" },
    rest: { label: "REST", message: "RELAX", className: "phase-rest" }
  };

  function clamp(value, min, max) {
    value = Number.parseInt(value, 10);
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function getConfig() {
    return {
      rounds: clamp(els.rounds.value, 1, 99),
      work: clamp(els.workTime.value, 5, 3599),
      rest: clamp(els.restTime.value, 0, 3599),
      prepare: clamp(els.prepareTime.value, 0, 60)
    };
  }

  function normalizeInputs() {
    const c = getConfig();
    els.rounds.value = c.rounds;
    els.workTime.value = c.work;
    els.restTime.value = c.rest;
    els.prepareTime.value = c.prepare;
    updateSummary();
  }

  function formatTime(totalSeconds) {
    const sec = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateSummary() {
    const c = getConfig();
    const total = c.prepare + (c.rounds * c.work) + (Math.max(0, c.rounds - 1) * c.rest);
    els.totalDuration.textContent = formatTime(total);
  }

  function showView(view) {
    [els.setupView, els.timerView, els.doneView].forEach(v => v.classList.remove("active"));
    view.classList.add("active");
  }

  async function initAudio() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) state.audioCtx = new AudioCtx();
    }
    if (state.audioCtx?.state === "suspended") {
      try { await state.audioCtx.resume(); } catch (_) {}
    }
  }

  function beep({ frequency = 880, duration = 0.12, volume = 0.18, type = "square", delay = 0 } = {}) {
    if (!state.sound || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function cue(kind) {
    if (!state.sound) return;
    if (kind === "ready") {
      beep({ frequency: 660, duration: .09, delay: 0 });
      beep({ frequency: 880, duration: .12, delay: .13 });
    } else if (kind === "work") {
      beep({ frequency: 740, duration: .10, delay: 0 });
      beep({ frequency: 980, duration: .10, delay: .13 });
      beep({ frequency: 1220, duration: .16, delay: .26 });
    } else if (kind === "rest") {
      beep({ frequency: 700, duration: .14, type: "sine", delay: 0 });
      beep({ frequency: 440, duration: .22, type: "sine", delay: .17 });
    } else if (kind === "last") {
      beep({ frequency: 1240, duration: .07, volume: .14 });
    } else if (kind === "done") {
      beep({ frequency: 660, duration: .12, delay: 0 });
      beep({ frequency: 880, duration: .12, delay: .14 });
      beep({ frequency: 1100, duration: .18, delay: .28 });
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      els.wakeStatus.textContent = "NO WAKE LOCK";
      els.wakeStatus.classList.add("off");
      return;
    }
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      els.wakeStatus.textContent = "AWAKE";
      els.wakeStatus.classList.remove("off");
      state.wakeLock.addEventListener("release", () => {
        els.wakeStatus.textContent = "WAKE OFF";
        els.wakeStatus.classList.add("off");
      });
    } catch (_) {
      els.wakeStatus.textContent = "WAKE OFF";
      els.wakeStatus.classList.add("off");
    }
  }

  async function releaseWakeLock() {
    try { await state.wakeLock?.release(); } catch (_) {}
    state.wakeLock = null;
  }

  function setTimerTheme(className) {
    els.timerPanel.classList.remove("phase-ready", "phase-work", "phase-rest", "phase-last", "phase-paused", "phase-complete");
    els.timerPanel.classList.add(className);
  }

  function describeNext() {
    const c = state.config;
    if (state.phase === "ready") return `NEXT: WORK ${formatTime(c.work)}`;
    if (state.phase === "work") {
      if (state.round >= c.rounds) return "NEXT: FINISH";
      if (c.rest > 0) return `NEXT: REST ${formatTime(c.rest)}`;
      return `NEXT: ROUND ${String(state.round + 1).padStart(2, "0")}`;
    }
    if (state.phase === "rest") return `NEXT: WORK ${formatTime(c.work)}`;
    return "";
  }

  function startPhase(phase, duration, { playCue = true } = {}) {
    state.phase = phase;
    state.phaseDuration = duration;
    state.phaseEndsAt = performance.now() + duration * 1000;
    state.lastRenderedSecond = null;
    state.lastFiveAlertSecond = null;
    state.paused = false;
    els.pauseBtn.textContent = "PAUSE";
    els.alertBanner.textContent = "";

    const info = PHASES[phase];
    els.phaseLabel.textContent = info.label;
    els.phaseMessage.textContent = info.message;
    setTimerTheme(info.className);
    els.roundCounter.textContent = `ROUND ${String(state.round).padStart(2, "0")} / ${String(state.config.rounds).padStart(2, "0")}`;
    els.nextLine.textContent = describeNext();
    if (playCue) cue(phase);
    renderTick(true);
  }

  function advancePhase() {
    const c = state.config;
    if (state.phase === "ready") {
      startPhase("work", c.work);
      return;
    }
    if (state.phase === "work") {
      if (state.round >= c.rounds) {
        finishWorkout();
        return;
      }
      if (c.rest > 0) {
        startPhase("rest", c.rest);
      } else {
        state.round += 1;
        startPhase("work", c.work);
      }
      return;
    }
    if (state.phase === "rest") {
      state.round += 1;
      startPhase("work", c.work);
    }
  }

  function renderTick(force = false) {
    if (!state.config || state.paused || !["ready","work","rest"].includes(state.phase)) return;

    const remainingMs = state.phaseEndsAt - performance.now();
    if (remainingMs <= 0) {
      advancePhase();
      return;
    }

    const remaining = Math.ceil(remainingMs / 1000);
    if (!force && remaining === state.lastRenderedSecond) return;
    state.lastRenderedSecond = remaining;

    els.timerDisplay.textContent = formatTime(remaining);
    const progress = Math.max(0, Math.min(1, remainingMs / (state.phaseDuration * 1000 || 1)));
    els.phaseProgressBar.style.transform = `scaleX(${progress})`;

    if (remaining <= 5) {
      if (state.phase === "work") {
        setTimerTheme("phase-last");
        els.phaseMessage.textContent = "FINAL EFFORT";
        els.alertBanner.textContent = "FINAL EFFORT";
      } else if (state.phase === "rest" || state.phase === "ready") {
        setTimerTheme("phase-last");
        els.phaseMessage.textContent = "GET READY!";
        els.alertBanner.textContent = "GET READY!";
      }
      if (state.lastFiveAlertSecond !== remaining) {
        state.lastFiveAlertSecond = remaining;
        cue("last");
      }
    } else {
      const info = PHASES[state.phase];
      setTimerTheme(info.className);
      els.phaseMessage.textContent = info.message;
      els.alertBanner.textContent = "";
    }
  }

  async function startWorkout() {
    normalizeInputs();
    state.config = getConfig();
    state.round = 1;
    state.paused = false;
    await initAudio();
    showView(els.timerView);
    await requestWakeLock();

    clearInterval(state.interval);
    state.interval = setInterval(() => renderTick(), 100);

    if (state.config.prepare > 0) startPhase("ready", state.config.prepare);
    else startPhase("work", state.config.work);
  }

  function togglePause() {
    if (!state.config) return;
    if (!state.paused) {
      state.pausedRemaining = Math.max(0, state.phaseEndsAt - performance.now());
      state.paused = true;
      els.pauseBtn.textContent = "RESUME";
      els.phaseMessage.textContent = "PAUSED";
      els.phaseLabel.textContent = "PAUSED";
      els.alertBanner.textContent = "";
      setTimerTheme("phase-paused");
    } else {
      state.phaseEndsAt = performance.now() + state.pausedRemaining;
      state.paused = false;
      els.pauseBtn.textContent = "PAUSE";
      const info = PHASES[state.phase];
      els.phaseLabel.textContent = info.label;
      els.phaseMessage.textContent = info.message;
      renderTick(true);
    }
  }

  function skipPhase() {
    if (!state.config) return;
    state.paused = false;
    advancePhase();
  }

  async function stopWorkout() {
    clearInterval(state.interval);
    state.interval = null;
    state.config = null;
    state.phase = "idle";
    state.paused = false;
    await releaseWakeLock();
    showView(els.setupView);
  }

  async function finishWorkout() {
    clearInterval(state.interval);
    state.interval = null;
    cue("done");
    els.doneSummary.textContent = `${state.config.rounds} rounds crushed.`;
    setTimerTheme("phase-complete");
    await releaseWakeLock();
    showView(els.doneView);
  }

  function updateInstallHint() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) els.installHint.textContent = "INSTALLED / READY";
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) els.installHint.textContent = "SAFARI → SHARE → ADD TO HOME";
    else els.installHint.textContent = "ADD TO HOME SCREEN";
  }

  $$("input[type=number]").forEach(input => {
    input.addEventListener("change", normalizeInputs);
    input.addEventListener("input", updateSummary);
  });

  $$("[data-step]").forEach(btn => btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.step);
    input.value = clamp(Number(input.value) + Number(btn.dataset.delta), Number(input.min), Number(input.max));
    updateSummary();
  }));

  $$(".preset").forEach(btn => btn.addEventListener("click", () => {
    els.rounds.value = btn.dataset.rounds;
    els.workTime.value = btn.dataset.work;
    els.restTime.value = btn.dataset.rest;
    els.prepareTime.value = btn.dataset.prepare;
    updateSummary();
  }));

  els.startBtn.addEventListener("click", startWorkout);
  els.pauseBtn.addEventListener("click", togglePause);
  els.skipBtn.addEventListener("click", skipPhase);
  els.stopBtn.addEventListener("click", stopWorkout);
  els.againBtn.addEventListener("click", () => showView(els.setupView));

  els.soundToggle.addEventListener("click", async () => {
    state.sound = !state.sound;
    els.soundToggle.classList.toggle("off", !state.sound);
    els.soundToggle.setAttribute("aria-pressed", String(state.sound));
    if (state.sound) await initAudio();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.config && !state.paused) {
      await requestWakeLock();
      renderTick(true);
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installHint.textContent = "INSTALL AVAILABLE";
  });

  window.addEventListener("appinstalled", updateInstallHint);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  updateSummary();
  updateInstallHint();
})();
