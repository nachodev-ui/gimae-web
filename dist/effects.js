(() => {
  'use strict';

  const settings = window.GIMAE?.EFFECTS || {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* =======================================================
     CURSOR KIRAKIRA
     Desactívalo cambiando cursorSparkles a false en content.js.
     ======================================================= */
  function setupCursorSparkles() {
    if (settings.cursorSparkles === false || reducedMotion.matches || !finePointer.matches) return;

    const symbols = ['✦', '✧', '⋆', '♡'];
    const colors = ['#e84694', '#f0b92f', '#70c9e8', '#a978cf'];
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;

    document.addEventListener('pointermove', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const now = performance.now();
      const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY);
      if (now - lastTime < 38 || distance < 9) return;

      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = now;

      const sparkle = document.createElement('span');
      sparkle.className = 'cursor-sparkle';
      sparkle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      sparkle.style.setProperty('--sparkle-x', `${event.clientX}px`);
      sparkle.style.setProperty('--sparkle-y', `${event.clientY}px`);
      sparkle.style.setProperty('--sparkle-color', colors[Math.floor(Math.random() * colors.length)]);
      sparkle.style.setProperty('--sparkle-drift', `${Math.round(Math.random() * 22 - 11)}px`);
      sparkle.style.setProperty('--sparkle-rotation', `${Math.round(Math.random() * 90 - 45)}deg`);
      document.body.append(sparkle);
      sparkle.addEventListener('animationend', () => sparkle.remove(), { once: true });
    }, { passive: true });
  }

  /* =======================================================
     ENTRADA Y CAMBIOS DE ESCENA
     Crea un telón entre páginas y revela las secciones al aparecer.
     ======================================================= */
  function setupStageTransitions() {
    if (settings.stageTransitions === false || reducedMotion.matches) return;

    document.documentElement.classList.add('effects-ready');
    const curtain = document.createElement('div');
    curtain.className = 'stage-curtain is-opening';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = '<span class="stage-curtain-panel stage-curtain-left"></span><span class="stage-curtain-panel stage-curtain-right"></span><span class="stage-curtain-star">✦</span>';
    document.body.append(curtain);
    window.setTimeout(() => curtain.classList.remove('is-opening'), 1150);

    const sections = [...document.querySelectorAll('main > section')];
    sections.forEach(section => section.classList.add('stage-reveal'));

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-onstage');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
      sections.forEach(section => observer.observe(section));
    } else {
      sections.forEach(section => section.classList.add('is-onstage'));
    }

    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;

      const destination = new URL(link.href, location.href);
      const samePage = destination.pathname === location.pathname && destination.search === location.search;
      if (destination.origin !== location.origin || (samePage && destination.hash)) return;

      event.preventDefault();
      curtain.classList.remove('is-opening');
      curtain.classList.add('is-closing');
      window.setTimeout(() => { location.href = destination.href; }, 470);
    });
  }

  /* =======================================================
     MÚSICA IDOL ORIGINAL
     Se sintetiza con Web Audio: no descarga canciones ni usa copyright.
     Ajusta musicStartsEnabled y volume en content.js.
     ======================================================= */
  function setupMusic() {
    if (settings.music === false) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const storageKey = 'gimae-music-enabled-v1';
    let wanted = settings.musicStartsEnabled !== false;
    let context = null;
    let master = null;
    let noiseBuffer = null;
    let schedulerId = 0;
    let nextNoteTime = 0;
    let step = 0;
    let activated = false;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) wanted = saved === 'true';
    } catch {
      // La preferencia seguirá funcionando durante esta visita.
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'music-toggle';
    button.innerHTML = '<span class="music-note" aria-hidden="true">♫</span><span>Música</span><span class="music-equalizer" aria-hidden="true"><i></i><i></i><i></i></span><strong></strong>';
    document.body.append(button);

    function remember() {
      try { localStorage.setItem(storageKey, String(wanted)); } catch { /* localStorage puede estar bloqueado. */ }
    }

    function updateButton() {
      const playing = wanted && activated && context?.state === 'running';
      button.classList.toggle('is-playing', playing);
      button.classList.toggle('is-muted', !wanted);
      button.setAttribute('aria-pressed', String(wanted));
      button.querySelector('strong').textContent = wanted ? (playing ? 'ON' : 'LISTA') : 'OFF';
      button.setAttribute('aria-label', wanted
        ? (playing ? 'Silenciar música de fondo' : 'Música activada; comenzará con tu próxima interacción')
        : 'Activar música de fondo');
      button.title = button.getAttribute('aria-label');
    }

    if (!AudioContextClass) {
      button.disabled = true;
      button.querySelector('strong').textContent = 'NO DISP.';
      button.setAttribute('aria-label', 'La música no es compatible con este navegador');
      return;
    }

    const midiToFrequency = note => 440 * Math.pow(2, (note - 69) / 12);
    const melody = [76, 78, 81, null, 78, 76, 73, null, 74, 76, 78, 81, 83, 81, 78, null, 76, 78, 81, 85, 83, 81, 78, 76, 74, 76, 78, null, 73, 74, 76, null];
    const bass = [45, 45, 48, 48, 41, 41, 43, 43, 45, 45, 48, 48, 41, 43, 45, 45];
    const beatLength = 60 / 132 / 4;

    function ensureAudio() {
      if (context) return;
      context = new AudioContextClass();
      master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      master.gain.value = 0;
      master.connect(compressor).connect(context.destination);

      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .18), context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }

    function playTone(note, time, duration, type, gainValue, detune = 0) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(midiToFrequency(note), time);
      oscillator.detune.value = detune;
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(gainValue, time + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(time);
      oscillator.stop(time + duration + .03);
    }

    function playNoise(time, duration, gainValue, highpass) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noiseBuffer;
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      gain.gain.setValueAtTime(gainValue, time);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start(time);
      source.stop(time + duration);
    }

    function playKick(time) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(135, time);
      oscillator.frequency.exponentialRampToValueAtTime(48, time + .13);
      gain.gain.setValueAtTime(.34, time);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .15);
      oscillator.connect(gain).connect(master);
      oscillator.start(time);
      oscillator.stop(time + .17);
    }

    function scheduleStep(index, time) {
      const loopStep = index % melody.length;
      if (loopStep % 4 === 0) playKick(time);
      if (loopStep % 8 === 4) playNoise(time, .09, .12, 1150);
      if (loopStep % 2 === 0) playNoise(time, .035, .026, 5200);

      if (loopStep % 2 === 0) {
        const bassNote = bass[Math.floor(loopStep / 2) % bass.length];
        playTone(bassNote, time, beatLength * 1.7, 'triangle', .085);
      }

      const melodyNote = melody[loopStep];
      if (melodyNote) {
        playTone(melodyNote, time, beatLength * 1.7, 'triangle', .055);
        playTone(melodyNote + 12, time, beatLength * .7, 'sine', .018, 4);
      }

      if (loopStep === 0 || loopStep === 16) {
        const chord = loopStep === 0 ? [57, 61, 64] : [53, 57, 60];
        chord.forEach((note, chordIndex) => playTone(note, time + chordIndex * .012, beatLength * 7, 'sine', .018));
      }
    }

    function scheduler() {
      if (!context || context.state !== 'running') return;
      while (nextNoteTime < context.currentTime + .14) {
        scheduleStep(step, nextNoteTime);
        nextNoteTime += beatLength;
        step = (step + 1) % melody.length;
      }
    }

    async function startMusic() {
      if (!wanted || document.hidden) return;
      ensureAudio();
      if (schedulerId && context.state === 'running') {
        updateButton();
        return;
      }
      try {
        await context.resume();
        activated = true;
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(Math.max(master.gain.value, .0001), context.currentTime);
        master.gain.exponentialRampToValueAtTime(Math.min(.08, Math.max(.01, Number(settings.volume) || .035)), context.currentTime + .18);
        nextNoteTime = context.currentTime + .04;
        window.clearInterval(schedulerId);
        schedulerId = window.setInterval(scheduler, 25);
        scheduler();
      } catch {
        wanted = false;
      }
      updateButton();
    }

    function stopMusic() {
      window.clearInterval(schedulerId);
      schedulerId = 0;
      if (context && context.state === 'running') {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(.0001, context.currentTime, .025);
        window.setTimeout(() => {
          if (!wanted && context?.state === 'running') context.suspend().catch(() => {});
        }, 160);
      }
      updateButton();
    }

    button.addEventListener('click', () => {
      wanted = !wanted;
      remember();
      if (wanted) startMusic();
      else stopMusic();
    });

    const removeUnlockListeners = () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    const unlock = event => {
      if (event.target.closest?.('.music-toggle')) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      removeUnlockListeners();
      if (wanted) startMusic();
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.clearInterval(schedulerId);
        schedulerId = 0;
        if (context?.state === 'running') context.suspend().catch(() => {});
      } else if (wanted && activated) {
        startMusic();
      }
      updateButton();
    });

    window.addEventListener('pagehide', () => {
      window.clearInterval(schedulerId);
      if (context && context.state !== 'closed') context.close().catch(() => {});
    }, { once: true });

    updateButton();
  }

  setupCursorSparkles();
  setupStageTransitions();
  setupMusic();
})();
