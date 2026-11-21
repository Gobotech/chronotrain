(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    setupView: $("#setupView"), timerView: $("#timerView"), doneView: $("#doneView"), historyView: $("#historyView"), historyOpenBtn: $("#historyOpenBtn"), historyBackBtn: $("#historyBackBtn"), savePrompt: $("#savePrompt"), saveForm: $("#saveForm"), saveYesBtn: $("#saveYesBtn"), saveNoBtn: $("#saveNoBtn"), cancelSaveBtn: $("#cancelSaveBtn"), saveFeedback: $("#saveFeedback"),
    rounds: $("#rounds"), series: $("#series"), workoutName: $("#workoutName"), workoutDescription: $("#workoutDescription"), roundsTotal: $("#roundsTotal"), historyList: $("#historyList"), historyCount: $("#historyCount"), clearHistoryBtn: $("#clearHistoryBtn"), workTime: $("#workTime"), restTime: $("#restTime"), prepareTime: $("#prepareTime"), seriesRestTime: $("#seriesRestTime"),
    totalDuration: $("#totalDuration"), startBtn: $("#startBtn"), pauseBtn: $("#pauseBtn"), skipBtn: $("#skipBtn"), stopBtn: $("#stopBtn"), againBtn: $("#againBtn"),
    soundToggle: $("#soundToggle"), roundCounter: $("#roundCounter"), timerPanel: $("#timerPanel"), phaseMessage: $("#phaseMessage"), phaseLabel: $("#phaseLabel"), timerDisplay: $("#timerDisplay"), phaseProgressBar: $("#phaseProgressBar"), nextLine: $("#nextLine"), alertBanner: $("#alertBanner"), wakeStatus: $("#wakeStatus"), doneSummary: $("#doneSummary"), installHint: $("#installHint")
  };

  const state = {
    config: null,
    phase: "idle",
    round: 1,
    series: 1,
    workoutMeta: null,
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
    rest: { label: "REST", message: "RELAX", className: "phase-rest" },
    seriesRest: { label: "SERIES REST", message: "RELAX", className: "phase-series-rest" }
  };

  function clamp(value, min, max) {
    value = Number.parseInt(value, 10);
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  function getConfig() {
    return {
      rounds: clamp(els.rounds.value, 1, 99),
      series: clamp(els.series.value, 1, 99),
      work: clamp(els.workTime.value, 5, 3599),
      rest: clamp(els.restTime.value, 0, 3599),
      seriesRest: clamp(els.seriesRestTime.value, 0, 3599),
      prepare: clamp(els.prepareTime.value, 0, 60)
    };
  }

  function normalizeInputs() {
    const c = getConfig();
    els.rounds.value = c.rounds;
    els.series.value = c.series;
    els.workTime.value = c.work;
    els.restTime.value = c.rest;
    els.seriesRestTime.value = c.seriesRest;
    els.prepareTime.value = c.prepare;
    updateSummary();
  }

  function formatTime(totalSeconds) {
    const sec = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function plannedSeconds(c) {
    return c.prepare + c.series * c.rounds * c.work + c.series * Math.max(0, c.rounds - 1) * c.rest + Math.max(0, c.series - 1) * c.seriesRest;
  }

  function updateSummary() {
    const c = getConfig();
    const roundsTotal = c.rounds * c.series;
    const total = plannedSeconds(c);
    els.totalDuration.textContent = formatTime(total);
    els.roundsTotal.textContent = roundsTotal;
  }

  function showView(view) {
    [els.setupView, els.timerView, els.doneView, els.historyView].forEach(v => v.classList.remove("active"));
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
    els.timerPanel.classList.remove("phase-ready", "phase-work", "phase-rest", "phase-last", "phase-paused", "phase-complete", "phase-series-rest");
    els.timerPanel.classList.add(className);
  }

  function describeNext() {
    const c = state.config;
    if (state.phase === "ready") return `NEXT: WORK ${formatTime(c.work)}`;
    if (state.phase === "work") {
      if (state.round >= c.rounds && state.series >= c.series) return "NEXT: FINISH";
      if (state.round >= c.rounds) return c.seriesRest > 0 ? `NEXT: SERIES REST ${formatTime(c.seriesRest)}` : `NEXT: SERIES ${state.series + 1}`;
      return c.rest > 0 ? `NEXT: REST ${formatTime(c.rest)}` : `NEXT: ROUND ${state.round + 1}`;
    }
    if (state.phase === "rest") return `NEXT: WORK ${formatTime(c.work)}`;
    if (state.phase === "seriesRest") return `NEXT: SERIES ${state.series + 1} · WORK ${formatTime(c.work)}`;
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
    els.roundCounter.textContent = `SERIES ${String(state.series).padStart(2, "0")} / ${String(state.config.series).padStart(2, "0")} · ROUND ${String(state.round).padStart(2, "0")} / ${String(state.config.rounds).padStart(2, "0")}`;
    els.nextLine.textContent = describeNext();
    if (playCue) cue(phase);
    renderTick(true);
  }

  function nextRound() {
    if (state.round >= state.config.rounds) {
      state.series += 1;
      state.round = 1;
    } else {
      state.round += 1;
    }
    startPhase("work", state.config.work);
  }

  function advancePhase() {
    const c = state.config;
    if (state.phase === "ready") {
      startPhase("work", c.work);
      return;
    }
    if (state.phase === "work") {
      if (state.round >= c.rounds && state.series >= c.series) {
        finishWorkout();
        return;
      }
      const betweenSeries = state.round >= c.rounds;
      const duration = betweenSeries ? c.seriesRest : c.rest;
      if (duration > 0) {
        startPhase(betweenSeries ? "seriesRest" : "rest", duration);
      } else {
        nextRound();
      }
      return;
    }
    if (state.phase === "rest" || state.phase === "seriesRest") {
      nextRound();
    }
  }

  function renderTick(force = false) {
    if (!state.config || state.paused || !["ready","work","rest","seriesRest"].includes(state.phase)) return;

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
      } else if (state.phase === "rest" || state.phase === "ready" || state.phase === "seriesRest") {
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
    state.series = 1;
    state.workoutMeta = { startedAt: new Date().toISOString() };
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
    els.doneSummary.textContent = `${state.config.series} series · ${state.config.rounds} rounds per series · ${state.config.series * state.config.rounds} rounds total.`;
    els.saveForm.reset();
    els.saveForm.hidden = true;
    els.savePrompt.hidden = false;
    els.saveFeedback.hidden = true;
    els.againBtn.textContent = "TRAIN AGAIN";
    setTimerTheme("phase-complete");
    await releaseWakeLock();
    showView(els.doneView);
  }

  const HISTORY_KEY = "chronotrain-training-log-v1";

  function getHistory() {
    try {
      const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_) { return []; }
  }

  function saveCompletedWorkout(name, description) {
    const c = state.config;
    if (!c) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      ...state.workoutMeta,
      name, description,
      series: c.series, rounds: c.rounds,
      work: c.work, rest: c.rest, seriesRest: c.seriesRest, prepare: c.prepare,
      plannedSeconds: plannedSeconds(c)
    };
    try {
      const items = getHistory();
      items.unshift(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 250)));
    } catch (_) { /* Private mode or storage disabled: workout still completes. */ }
    renderHistory();
  }

  function renderHistory() {
    const items = getHistory();
    els.historyList.replaceChildren();
    els.historyCount.textContent = `${items.length} SESSION${items.length === 1 ? "" : "S"}`;
    els.clearHistoryBtn.hidden = !items.length;
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "No workouts completed yet. Your training history will appear here.";
      els.historyList.append(empty);
      return;
    }
    items.forEach(item => {
      const card = document.createElement("article");
      card.className = "history-entry";
      const title = document.createElement("h4");
      title.textContent = typeof item.name === "string" ? item.name : "Interval Workout";
      const date = document.createElement("time");
      date.dateTime = item.date;
      date.textContent = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.date));
      const details = document.createElement("p");
      details.textContent = `${item.series} series × ${item.rounds} rounds · ${formatTime(item.work)} work / ${formatTime(item.rest)} rest · ${formatTime(item.seriesRest ?? item.rest)} between series · ${formatTime(item.plannedSeconds)} total`;
      card.append(title, date, details);
      if (item.description) {
        const desc = document.createElement("p");
        desc.className = "history-description";
        desc.textContent = item.description;
        card.append(desc);
      }
      els.historyList.append(card);
    });
  }

  els.historyOpenBtn.addEventListener("click", () => { renderHistory(); showView(els.historyView); });
  els.historyBackBtn.addEventListener("click", () => showView(els.setupView));
  els.saveYesBtn.addEventListener("click", () => {
    els.savePrompt.hidden = true;
    els.saveForm.hidden = false;
    els.workoutName.focus();
  });
  function skipSaving() {
    els.savePrompt.hidden = true;
    els.saveForm.hidden = true;
    els.saveFeedback.hidden = false;
    els.saveFeedback.textContent = "WORKOUT NOT SAVED";
  }
  els.saveNoBtn.addEventListener("click", skipSaving);
  els.cancelSaveBtn.addEventListener("click", skipSaving);
  els.saveForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = els.workoutName.value.trim().slice(0, 70);
    if (!name) { els.workoutName.focus(); return; }
    saveCompletedWorkout(name, els.workoutDescription.value.trim().slice(0, 500));
    els.saveForm.hidden = true;
    els.saveFeedback.textContent = "✓ SAVED TO TRAINING LOG";
    els.saveFeedback.hidden = false;
  });

  els.clearHistoryBtn.addEventListener("click", () => {
    if (!window.confirm("¿Borrar todo el historial de entrenamientos de este dispositivo?")) return;
    try { localStorage.removeItem(HISTORY_KEY); } catch (_) {}
    renderHistory();
  });

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
    els.series.value = btn.dataset.series;
    els.rounds.value = btn.dataset.rounds;
    els.workTime.value = btn.dataset.work;
    els.restTime.value = btn.dataset.rest;
    els.prepareTime.value = btn.dataset.prepare;
    els.seriesRestTime.value = btn.dataset.seriesRest || "60";
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
  renderHistory();
  updateInstallHint();
})();
