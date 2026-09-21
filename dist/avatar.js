(function avatarModule() {
  'use strict';

  const EXPRESSIONS = Object.freeze([
    'neutral',
    'happy',
    'excited',
    'shy',
    'surprised',
    'sad',
    'thinking',
    'wink'
  ]);
  const DIALOG_STYLES = Object.freeze(['default', 'pastel-angular']);
  const validDialogStyle = (value) => DIALOG_STYLES.includes(value) ? value : 'default';

  const MOUTH_EXPRESSIONS = new Set(['neutral', 'happy', 'excited']);
  const MOUTH_SPRITES = Object.freeze([
    'neutral-mouth',
    'happy-mouth',
    'excited-mouth'
  ]);
  const SPRITES = Object.freeze([
    ...EXPRESSIONS,
    ...MOUTH_SPRITES
  ]);
  const DEFAULT_SPEECH = '¡Hola! Gracias por venir a brillar con nosotras. ¿Probamos otra expresión?';
  const SPEECH_FRAME_DURATION = 125;

  // El parpadeo se omite deliberadamente: sin una capa de ojos cerrados,
  // comprimir u oscurecer una franja también deforma nariz, cabello y rostro.
  // Mantener la ilustración estable produce un resultado más natural.

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const afterNextPaint = () => new Promise((resolve) => {
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
    schedule(() => schedule(resolve));
  });

  class AvatarRenderer {
    constructor(mount, options = {}) {
      if (!(mount instanceof Element)) {
        throw new TypeError('AvatarRenderer necesita un elemento donde montar el avatar.');
      }

      this.mount = mount;
      this.basePath = options.basePath || 'images/avatar/';
      this.expression = EXPRESSIONS.includes(options.expression) ? options.expression : 'neutral';
      this.crossfadeDuration = Number.isFinite(options.crossfadeDuration)
        ? Math.max(0, options.crossfadeDuration)
        : 150;
      this._destroyed = false;
      this._idleRequested = options.idle !== false;
      this._motionDisabled = options.reducedMotion === true;
      this._speechToken = 0;
      this._expressionRequestToken = 0;
      this._renderToken = 0;
      this._currentSprite = null;
      this._expressionTarget = null;
      this._transitionTimer = null;
      this._transitionFinish = null;
      this._mouthOpen = false;
      this._mouthDebug = false;
      this._failedSprites = new Set();
      this._motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._onMotionPreferenceChange = () => {
        if (this._isReducedMotion()) this.stopSpeaking();
        this._syncMotionPreference();
      };

      this.root = document.createElement('div');
      this.root.className = 'avatar-renderer';
      this.root.dataset.expression = this.expression;
      this.root.setAttribute('aria-hidden', 'true');
      this.root.style.setProperty('--avatar-crossfade', `${this.crossfadeDuration}ms`);

      const sway = document.createElement('div');
      sway.className = 'avatar-renderer__sway';
      const breathe = document.createElement('div');
      breathe.className = 'avatar-renderer__breathe';
      const spriteStack = document.createElement('div');
      spriteStack.className = 'avatar-renderer__sprites';

      this.layers = new Map(SPRITES.map((name) => {
        const image = document.createElement('img');
        image.className = 'avatar-renderer__sprite';
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.draggable = false;
        image.decoding = 'async';
        image.dataset.sprite = name;
        image.src = this._spriteUrl(name);
        spriteStack.append(image);
        return [name, image];
      }));
      this.placeholder = document.createElement('div');
      this.placeholder.className = 'avatar-renderer__placeholder';
      this.placeholder.setAttribute('aria-hidden', 'true');
      this.placeholder.textContent = '✦';
      spriteStack.append(this.placeholder);

      breathe.append(spriteStack);
      sway.append(breathe);
      this.root.append(sway);
      this.mount.append(this.root);

      if (typeof this._motionQuery.addEventListener === 'function') {
        this._motionQuery.addEventListener('change', this._onMotionPreferenceChange);
      } else {
        this._motionQuery.addListener(this._onMotionPreferenceChange);
      }

      this._preloadPromise = this._preloadSprites();
      this.ready = this._preloadPromise.then(() => {
        if (!this._destroyed) this._showOnly(this.expression);
      });
      this._syncMotionPreference();
    }

    _spriteUrl(name) {
      return new URL(`${this.basePath}${name}.webp`, document.baseURI).href;
    }

    async _preloadSprite(name, image) {
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch (error) {
          if (!image.complete || image.naturalWidth === 0) throw error;
        }
      } else if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      }

      if (image.naturalWidth === 0) {
        throw new Error(`No se pudo precargar el sprite: ${name}`);
      }
    }

    async _preloadSprites() {
      await Promise.all(SPRITES.map(async (name) => {
        try {
          await this._preloadSprite(name, this.layers.get(name));
        } catch (error) {
          this._failedSprites.add(name);
          this.layers.get(name).dataset.loadError = 'true';
          console.warn(`El avatar usará un fallback porque no cargó ${name}.`, error);
        }
      }));
    }

    _isReducedMotion() {
      return this._motionQuery.matches || this._motionDisabled;
    }

    _syncMotionPreference() {
      if (this._destroyed) return;
      const reduced = this._isReducedMotion();
      this.root.classList.toggle('avatar-renderer--reduced-motion', reduced);
      this.root.classList.toggle('avatar-renderer--idle', this._idleRequested && !reduced);
      this.root.style.setProperty('--avatar-crossfade', reduced ? '0ms' : `${this.crossfadeDuration}ms`);
    }

    _resetLayerClasses() {
      this.layers.forEach((layer) => {
        layer.classList.remove(
          'is-visible',
          'is-mouth-visible',
          'is-expression-underlay',
          'is-expression-entering',
          'is-expression-entering-active'
        );
      });
      this.placeholder.classList.remove(
        'is-visible',
        'is-expression-underlay',
        'is-expression-entering',
        'is-expression-entering-active'
      );
    }

    _resolveSprite(name) {
      if (name === '__placeholder__') return null;
      if (this.layers.has(name) && !this._failedSprites.has(name)) return name;
      if (!this._failedSprites.has('neutral')) return 'neutral';
      return null;
    }

    _layerFor(name) {
      return name === '__placeholder__' ? this.placeholder : this.layers.get(name);
    }

    _showOnly(name) {
      const resolved = this._resolveSprite(name);
      const spriteKey = resolved || '__placeholder__';
      this._resetLayerClasses();
      this._layerFor(spriteKey).classList.add('is-visible');
      this._currentSprite = spriteKey;
      this._expressionTarget = null;
      this._syncMouthLayer();
    }

    _mouthSpriteName() {
      const mouth = `${this.expression}-mouth`;
      return MOUTH_EXPRESSIONS.has(this.expression)
        && this._currentSprite === this.expression
        && !this._failedSprites.has(mouth)
        ? mouth
        : null;
    }

    _syncMouthLayer() {
      MOUTH_SPRITES.forEach((name) => this.layers.get(name)?.classList.remove('is-mouth-visible'));
      const mouthSprite = this._mouthSpriteName();
      if (mouthSprite && (this._mouthOpen || this._mouthDebug)) {
        this.layers.get(mouthSprite)?.classList.add('is-mouth-visible');
      }
      this.root.classList.toggle('avatar-renderer--debug-mouth', this._mouthDebug);
    }

    _setMouthOpen(open) {
      this._mouthOpen = Boolean(open);
      this._syncMouthLayer();
    }

    setMouthDebug(enabled = true) {
      this._mouthDebug = Boolean(enabled);
      this._syncMouthLayer();
    }

    _cancelExpressionTransition(settleName) {
      this._renderToken += 1;
      if (this._transitionTimer !== null) {
        window.clearTimeout(this._transitionTimer);
        this._transitionTimer = null;
      }
      if (this._transitionFinish) {
        const finish = this._transitionFinish;
        this._transitionFinish = null;
        finish(false);
      }

      const settled = settleName || this._expressionTarget || this._currentSprite;
      if (settled) this._showOnly(settled);
      else this._resetLayerClasses();
    }

    async _crossfadeExpression(name) {
      if (this._destroyed || !EXPRESSIONS.includes(name)) return;
      await this._preloadPromise;
      if (this._destroyed) return;

      const requested = this._resolveSprite(name);
      const target = requested || '__placeholder__';
      const previous = this._expressionTarget || this._currentSprite;
      this._cancelExpressionTransition(previous);
      if (this._isReducedMotion() || !previous || previous === target || this.crossfadeDuration === 0) {
        this._showOnly(name);
        return;
      }

      const previousLayer = this._layerFor(previous);
      const incomingLayer = this._layerFor(target);
      const renderToken = ++this._renderToken;
      this._resetLayerClasses();
      previousLayer.classList.add('is-expression-underlay');
      incomingLayer.classList.add('is-expression-entering');
      this._expressionTarget = target;

      // Dos frames permiten iniciar la transición sin forzar una lectura de layout.
      await afterNextPaint();
      if (this._destroyed || renderToken !== this._renderToken) return;
      incomingLayer.classList.add('is-expression-entering-active');

      const completed = await new Promise((resolve) => {
        this._transitionFinish = resolve;
        this._transitionTimer = window.setTimeout(() => {
          this._transitionTimer = null;
          this._transitionFinish = null;
          resolve(true);
        }, this.crossfadeDuration + 34);
      });
      if (!completed || this._destroyed || renderToken !== this._renderToken) return;
      this._showOnly(target);
    }

    async setExpression(expression) {
      if (!EXPRESSIONS.includes(expression)) {
        throw new RangeError(`Expresión desconocida: ${expression}`);
      }
      const requestToken = ++this._expressionRequestToken;
      this.stopSpeaking();
      await this.ready;
      if (this._destroyed || requestToken !== this._expressionRequestToken) return;
      this.expression = expression;
      this.root.dataset.expression = expression;
      await this._crossfadeExpression(expression);
    }

    async speak(text) {
      const phrase = String(text || '').trim();
      this.stopSpeaking();
      if (!phrase || this._destroyed) return;

      await this.ready;
      if (this._destroyed) return;

      const speechToken = ++this._speechToken;
      const reduced = this._isReducedMotion();
      const duration = this._speechDuration(phrase);

      // Con movimiento reducido la ilustración permanece totalmente estable.
      if (reduced) {
        await this._waitForSpeech(speechToken, duration);
      } else if (!this._mouthSpriteName()) {
        this.root.classList.add('avatar-renderer--speaking-bounce');
        await this._waitForSpeech(speechToken, duration);
      } else {
        let elapsed = 0;
        let open = false;

        while (elapsed < duration) {
          if (this._destroyed || speechToken !== this._speechToken) return;
          open = !open;
          this._setMouthOpen(open);
          const frameDuration = Math.min(SPEECH_FRAME_DURATION, duration - elapsed);
          await wait(frameDuration);
          elapsed += frameDuration;
        }
      }

      if (this._destroyed || speechToken !== this._speechToken) return;
      this.stopSpeaking();
    }

    _speechDuration(phrase) {
      const characters = Array.from(phrase).length;
      const punctuation = (phrase.match(/[.,;:!?¡¿—-]/gu) || []).length;
      return Math.max(420, Math.min(12000, characters * 55 + punctuation * 95));
    }

    async _waitForSpeech(speechToken, duration) {
      let elapsed = 0;
      while (elapsed < duration) {
        if (this._destroyed || speechToken !== this._speechToken) return;
        const slice = Math.min(SPEECH_FRAME_DURATION, duration - elapsed);
        await wait(slice);
        elapsed += slice;
      }
    }

    stopSpeaking(options = {}) {
      this._speechToken += 1;
      if (this._destroyed) return;
      this.root.classList.remove('avatar-renderer--speaking-bounce');
      this._setMouthOpen(false);
      if (options.restore !== false && this.layers.has(this.expression)) {
        this._cancelExpressionTransition(this.expression);
        this._showOnly(this.expression);
      }
    }

    idle(enabled = true) {
      this._idleRequested = Boolean(enabled);
      this._syncMotionPreference();
    }

    setReducedMotion(reduced = true) {
      this._motionDisabled = Boolean(reduced);
      if (this._isReducedMotion()) {
        this.stopSpeaking();
        this._cancelExpressionTransition(this.expression);
        this._showOnly(this.expression);
      }
      this._syncMotionPreference();
    }

    destroy() {
      if (this._destroyed) return;
      this.stopSpeaking({ restore: false });
      this._destroyed = true;
      this._expressionRequestToken += 1;
      this._renderToken += 1;
      this._cancelExpressionTransition();
      if (typeof this._motionQuery.removeEventListener === 'function') {
        this._motionQuery.removeEventListener('change', this._onMotionPreferenceChange);
      } else {
        this._motionQuery.removeListener(this._onMotionPreferenceChange);
      }
      this.root.remove();
      this.layers.clear();
    }
  }

  function createButton(label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  // ?avatar-debug AÑADE este panel al widget definitivo; nunca lo reemplaza.
  // Incluye pruebas de expresión, habla continua, idle y capa de boca resaltada en rojo.
  function mountDebugPanel() {
    if (!new URLSearchParams(window.location.search).has('avatar-debug')) return;

    const panel = document.createElement('section');
    panel.className = 'avatar-debug';
    panel.setAttribute('aria-label', 'Panel de prueba del avatar de Suki');

    const stage = document.createElement('div');
    stage.className = 'avatar-debug__stage';

    const controls = document.createElement('div');
    controls.className = 'avatar-debug__controls';
    const heading = document.createElement('div');
    heading.className = 'avatar-debug__heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'AVATAR DEBUG';
    const title = document.createElement('strong');
    title.textContent = 'Suki · prueba de sprites';
    heading.append(eyebrow, title);

    const status = document.createElement('p');
    status.className = 'avatar-debug__status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Precargando 11 imágenes…';

    const expressionGroup = document.createElement('div');
    expressionGroup.className = 'avatar-debug__expressions';
    expressionGroup.setAttribute('role', 'group');
    expressionGroup.setAttribute('aria-label', 'Expresiones del avatar');

    const expressionButtons = new Map();
    EXPRESSIONS.forEach((expression) => {
      const button = createButton(expression, 'avatar-debug__expression');
      button.disabled = true;
      button.setAttribute('aria-pressed', String(expression === 'neutral'));
      expressionButtons.set(expression, button);
      expressionGroup.append(button);
    });

    const actions = document.createElement('div');
    actions.className = 'avatar-debug__actions';
    const speakButton = createButton('Hablar', 'avatar-debug__speak');
    speakButton.disabled = true;

    const idleLabel = document.createElement('label');
    idleLabel.className = 'avatar-debug__idle';
    const idleInput = document.createElement('input');
    idleInput.type = 'checkbox';
    idleInput.checked = true;
    const idleText = document.createElement('span');
    idleText.textContent = 'Idle';
    idleLabel.append(idleInput, idleText);
    actions.append(speakButton, idleLabel);

    const debugToggles = document.createElement('div');
    debugToggles.className = 'avatar-debug__toggles';
    const continuousLabel = document.createElement('label');
    continuousLabel.className = 'avatar-debug__idle';
    const continuousInput = document.createElement('input');
    continuousInput.type = 'checkbox';
    continuousInput.disabled = true;
    const continuousText = document.createElement('span');
    continuousText.textContent = 'Habla continua';
    continuousLabel.append(continuousInput, continuousText);

    const mouthDebugLabel = document.createElement('label');
    mouthDebugLabel.className = 'avatar-debug__idle';
    const mouthDebugInput = document.createElement('input');
    mouthDebugInput.type = 'checkbox';
    mouthDebugInput.disabled = true;
    const mouthDebugText = document.createElement('span');
    mouthDebugText.textContent = 'Mostrar capa de boca en rojo';
    mouthDebugLabel.append(mouthDebugInput, mouthDebugText);
    debugToggles.append(continuousLabel, mouthDebugLabel);

    const styleLabel = document.createElement('label');
    styleLabel.className = 'avatar-debug__style';
    styleLabel.textContent = 'Estilo del diálogo';
    const styleSelect = document.createElement('select');
    styleSelect.id = 'avatar-dialog-style';
    DIALOG_STYLES.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      styleSelect.append(option);
    });
    styleSelect.value = validDialogStyle(new URLSearchParams(location.search).get('avatar-style')
      || window.GIMAE?.AVATAR_CONFIG?.dialogStyle);
    styleSelect.addEventListener('change', () => window.GIMAE_AVATAR_WIDGET?.setDialogStyle(styleSelect.value));
    styleLabel.append(styleSelect);
    controls.append(heading, styleLabel, status, expressionGroup, actions, debugToggles);
    panel.append(stage, controls);
    document.body.append(panel);

    const renderer = new AvatarRenderer(stage, { expression: 'neutral', idle: true });
    let continuousToken = 0;

    const runContinuousSpeech = async () => {
      const token = ++continuousToken;
      speakButton.disabled = true;
      while (continuousInput.checked && !renderer._destroyed && token === continuousToken) {
        status.textContent = 'Habla continua activada…';
        await renderer.speak(DEFAULT_SPEECH);
        if (continuousInput.checked && !renderer._destroyed && token === continuousToken) await wait(120);
      }
      if (!renderer._destroyed && token === continuousToken) {
        speakButton.disabled = false;
        status.textContent = `Expresión: ${renderer.expression}`;
      }
    };

    expressionButtons.forEach((button, expression) => {
      button.addEventListener('click', async () => {
        await renderer.setExpression(expression);
        expressionButtons.forEach((candidate, name) => {
          candidate.setAttribute('aria-pressed', String(name === expression));
        });
        status.textContent = `Expresión: ${expression}`;
      });
    });

    speakButton.addEventListener('click', async () => {
      status.textContent = 'Reproduciendo habla de ejemplo…';
      speakButton.disabled = true;
      await renderer.speak(DEFAULT_SPEECH);
      if (!renderer._destroyed) {
        speakButton.disabled = false;
        status.textContent = `Expresión: ${renderer.expression}`;
      }
    });

    idleInput.addEventListener('change', () => {
      renderer.idle(idleInput.checked);
      status.textContent = idleInput.checked ? 'Idle activado' : 'Idle detenido';
    });

    continuousInput.addEventListener('change', () => {
      if (continuousInput.checked) void runContinuousSpeech();
      else {
        continuousToken += 1;
        renderer.stopSpeaking();
        speakButton.disabled = false;
        status.textContent = `Expresión: ${renderer.expression}`;
      }
    });

    mouthDebugInput.addEventListener('change', () => {
      renderer.setMouthDebug(mouthDebugInput.checked);
      status.textContent = mouthDebugInput.checked
        ? 'Capa de boca resaltada en rojo.'
        : `Expresión: ${renderer.expression}`;
    });

    renderer.ready.then(() => {
      expressionButtons.forEach((button) => { button.disabled = false; });
      speakButton.disabled = false;
      continuousInput.disabled = false;
      mouthDebugInput.disabled = false;
      status.textContent = 'Sprites precargados y decodificados.';
    }).catch((error) => {
      panel.classList.add('avatar-debug--error');
      status.textContent = `Error al cargar el avatar: ${error.message}`;
      console.error(error);
    });

    window.__GIMAE_AVATAR_DEBUG__ = Object.freeze({ panel, renderer });
  }

  class AvatarDialogueWidget {
    constructor(siteConfig = {}) {
      this.siteConfig = siteConfig;
      this.config = siteConfig.AVATAR_CONFIG || {};
      this.script = siteConfig.AVATAR_SCRIPT || {};
      this.nodes = this.script.nodes || {};
      this.name = String(this.config.name || 'Suki');
      this.label = String(this.config.label || 'Avatar animado · diálogos predefinidos');
      this.storageKey = String(this.config.storageKey || 'gimae.avatar.hidden');
      this.motionStorageKey = `${this.storageKey}.reducedMotion`;
      this.renderer = null;
      this.currentNode = null;
      this.currentParts = [];
      this.currentPartIndex = 0;
      this._openingPromise = null;
      this._navigationToken = 0;
      this._nodePending = false;
      this._needsResume = false;
      this._destroyed = false;
      this._typingToken = 0;
      this._isTyping = false;
      this._currentText = '';
      this._partLogged = false;
      this._returnFocus = null;
      this._motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this._motionDisabled = this._readMotionPreference();
      this._onMotionPreferenceChange = () => {
        if (this._isReducedMotion() && this._isTyping) this.skipTypewriter();
        this._syncMotionControl();
      };
      this._onViewportChange = () => this._syncVisualViewport();

      this._build();
      this.setDialogStyle(new URLSearchParams(location.search).get('avatar-style') || this.config.dialogStyle);
      if (typeof this._motionQuery.addEventListener === 'function') {
        this._motionQuery.addEventListener('change', this._onMotionPreferenceChange);
      } else {
        this._motionQuery.addListener(this._onMotionPreferenceChange);
      }
      this._syncMotionControl();
      this._syncVisualViewport();
      window.addEventListener('resize', this._onViewportChange, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._onViewportChange, { passive: true });
        window.visualViewport.addEventListener('scroll', this._onViewportChange, { passive: true });
      }
      this._observeDialogs();
      if (this._readHiddenPreference()) this.host.hidden = true;
    }

    _build() {
      this.host = document.createElement('div');
      this.host.className = 'avatar-widget-host';
      if (document.querySelector('.cart-fab')) this.host.classList.add('avatar-widget-host--avoids-cart');

      const suki = Array.isArray(this.siteConfig.members)
        ? this.siteConfig.members.find((member) => member && member.name === this.name)
        : null;
      if (suki && /^#[0-9a-f]{6}$/i.test(String(suki.accent || ''))) {
        this.host.style.setProperty('--avatar-accent', suki.accent);
      }

      this.launcher = createButton('', 'avatar-widget-launcher');
      this.launcher.setAttribute('aria-label', `Abrir avatar de ${this.name}: diálogos predefinidos`);
      this.launcher.setAttribute('aria-expanded', 'false');
      this.launcher.setAttribute('aria-controls', 'gimae-avatar-panel');
      const launcherStar = document.createElement('span');
      launcherStar.className = 'avatar-widget-launcher__star';
      launcherStar.setAttribute('aria-hidden', 'true');
      launcherStar.textContent = '✦';
      const launcherCopy = document.createElement('span');
      const launcherTitle = document.createElement('strong');
      launcherTitle.textContent = this.name;
      const launcherLabel = document.createElement('small');
      launcherLabel.textContent = this.label;
      launcherCopy.append(launcherTitle, launcherLabel);
      this.launcher.append(launcherStar, launcherCopy);

      this.panel = document.createElement('section');
      this.panel.id = 'gimae-avatar-panel';
      this.panel.className = 'avatar-widget-panel';
      this.panel.hidden = true;
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-modal', 'false');
      this.panel.setAttribute('aria-labelledby', 'gimae-avatar-title');

      const header = document.createElement('header');
      header.className = 'avatar-widget-header';
      const heading = document.createElement('div');
      heading.className = 'avatar-widget-heading';
      const visibleLabel = document.createElement('span');
      visibleLabel.textContent = this.label;
      const title = document.createElement('strong');
      title.id = 'gimae-avatar-title';
      title.textContent = this.name;
      heading.append(visibleLabel, title);

      const windowControls = document.createElement('div');
      windowControls.className = 'avatar-widget-window-controls';
      this.minimizeButton = createButton('—', 'avatar-widget-icon-button');
      this.minimizeButton.setAttribute('aria-label', 'Minimizar avatar');
      this.minimizeButton.setAttribute('aria-controls', 'gimae-avatar-content');
      this.minimizeButton.setAttribute('aria-expanded', 'true');
      this.closeButton = createButton('×', 'avatar-widget-icon-button');
      this.closeButton.setAttribute('aria-label', 'Cerrar avatar');
      windowControls.append(this.minimizeButton, this.closeButton);
      header.append(heading, windowControls);

      this.content = document.createElement('div');
      this.content.id = 'gimae-avatar-content';
      this.content.className = 'avatar-widget-content';
      this.stage = document.createElement('div');
      this.stage.className = 'avatar-widget-stage';
      this.stage.setAttribute('aria-hidden', 'true');

      const dialogue = document.createElement('div');
      dialogue.className = 'avatar-widget-dialogue';
      this.history = document.createElement('div');
      this.history.className = 'avatar-widget-history';
      this.history.setAttribute('role', 'log');
      this.history.setAttribute('aria-live', 'polite');
      this.history.setAttribute('aria-relevant', 'additions');
      this.history.setAttribute('aria-label', 'Historial de la conversación predefinida');

      this.nameplate = document.createElement('span');
      this.nameplate.className = 'avatar-widget-nameplate';
      this.nameplate.textContent = this.name;

      this.text = document.createElement('div');
      this.text.className = 'avatar-widget-text';
      this.text.tabIndex = 0;
      this.text.setAttribute('role', 'button');
      this.text.setAttribute('aria-live', 'off');
      this.text.setAttribute('aria-atomic', 'true');
      this.text.setAttribute('aria-label', 'Texto del avatar. Presiona Enter, espacio o haz clic para completar la escritura.');
      this.text.textContent = 'Abre el avatar para iniciar.';

      this.nextButton = createButton('Siguiente', 'avatar-widget-next');
      this.nextButton.hidden = true;
      this.options = document.createElement('div');
      this.options.className = 'avatar-widget-options';
      this.options.setAttribute('role', 'group');
      this.options.setAttribute('aria-label', 'Opciones de diálogo');
      // Wrappers are display:contents in default; existing text/history nodes stay intact.
      const box = document.createElement('div');
      box.className = 'avatar-pastel-box';
      const paper = document.createElement('span');
      paper.className = 'avatar-pastel-paper';
      paper.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('div');
      inner.className = 'avatar-pastel-inner';
      const ornament = (className, symbol) => {
        const node = document.createElement('span');
        node.className = className;
        node.setAttribute('aria-hidden', 'true');
        node.textContent = symbol;
        return node;
      };
      this.tail = ornament('avatar-pastel-tail', '✦');
      this.nameCharm = ornament('avatar-pastel-name-charm', '✦');
      this.nameplate.append(this.nameCharm);
      inner.append(this.nameplate, this.text, this.nextButton,
        ornament('avatar-pastel-next-mark', '♡'));
      box.append(paper, inner, this.tail,
        ornament('avatar-pastel-spark avatar-pastel-spark--one', '✦'),
        ornament('avatar-pastel-spark avatar-pastel-spark--two', '♡'),
        ornament('avatar-pastel-spark avatar-pastel-spark--three', '✦'));
      dialogue.append(this.history, box, this.options);
      this.content.append(this.stage, dialogue);

      this.footer = document.createElement('footer');
      this.footer.className = 'avatar-widget-footer';
      const privacy = document.createElement('small');
      privacy.textContent = 'Conversación local: no guarda ni envía tus respuestas.';
      const footerActions = document.createElement('div');
      footerActions.className = 'avatar-widget-footer-actions';
      this.motionButton = createButton('Desactivar animaciones', 'avatar-widget-motion');
      this.motionButton.setAttribute('aria-pressed', 'false');
      this.hideButton = createButton('Ocultar avatar', 'avatar-widget-hide');
      footerActions.append(this.motionButton, this.hideButton);
      this.footer.append(privacy, footerActions);

      this.panel.append(header, this.content, this.footer);
      this.host.append(this.launcher, this.panel);
      document.body.append(this.host);

      this.launcher.addEventListener('click', () => { void this.open(); });
      this.closeButton.addEventListener('click', () => this.close());
      this.minimizeButton.addEventListener('click', () => this.toggleMinimized());
      this.motionButton.addEventListener('click', () => this.setMotionDisabled(!this._motionDisabled));
      this.hideButton.addEventListener('click', () => this.hide());
      this.nextButton.addEventListener('click', () => this.nextPart());
      this.text.addEventListener('click', () => this.skipTypewriter());
      this.text.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && this._isTyping) {
          event.preventDefault();
          this.skipTypewriter();
        }
      });
      this.panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
      });
    }

    setDialogStyle(value) {
      this.dialogStyle = validDialogStyle(value);
      this.host.dataset.dialogStyle = this.dialogStyle;
      this.tail.textContent = this.dialogStyle === 'pastel-sticker' ? '♥' : '✦';
      this.nameCharm.textContent = this.dialogStyle === 'pastel-sticker' ? '♡' : '✦';
      const select = document.getElementById('avatar-dialog-style');
      if (select) select.value = this.dialogStyle;
    }

    _readHiddenPreference() {
      return this._readBooleanPreference(this.storageKey);
    }

    _readBooleanPreference(key) {
      try {
        return window.localStorage.getItem(key) === 'true';
      } catch {
        return false;
      }
    }

    _readMotionPreference() {
      return this._readBooleanPreference(this.motionStorageKey);
    }

    _writeBooleanPreference(key, enabled) {
      try {
        if (enabled) window.localStorage.setItem(key, 'true');
        else window.localStorage.removeItem(key);
      } catch {
        // La preferencia solo dura esta sesión si localStorage no está disponible.
      }
    }

    _writeMotionPreference(disabled) {
      this._writeBooleanPreference(this.motionStorageKey, disabled);
    }

    _isReducedMotion() {
      return this._motionQuery.matches || this._motionDisabled;
    }

    _syncMotionControl() {
      const systemReduced = this._motionQuery.matches;
      const reduced = this._isReducedMotion();
      if (this.host) this.host.classList.toggle('avatar-widget-host--reduced-motion', reduced);
      if (this.motionButton) {
        this.motionButton.disabled = systemReduced;
        this.motionButton.setAttribute('aria-pressed', String(reduced));
        this.motionButton.textContent = systemReduced
          ? 'Animaciones desactivadas por el sistema'
          : (this._motionDisabled ? 'Activar animaciones' : 'Desactivar animaciones');
      }
      if (this.renderer) this.renderer.setReducedMotion(this._motionDisabled);
    }

    _syncVisualViewport() {
      if (!this.host) return;
      const viewport = window.visualViewport;
      const height = viewport ? viewport.height : window.innerHeight;
      const keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      this.host.style.setProperty('--avatar-visible-height', `${Math.round(height)}px`);
      this.host.style.setProperty('--avatar-keyboard-inset', `${Math.round(keyboardInset)}px`);
    }

    setMotionDisabled(disabled = true) {
      this._motionDisabled = Boolean(disabled);
      this._writeMotionPreference(this._motionDisabled);
      if (this._isReducedMotion() && this._isTyping) this.skipTypewriter();
      this._syncMotionControl();
    }

    _writeHiddenPreference(hidden) {
      this._writeBooleanPreference(this.storageKey, hidden);
    }

    _observeDialogs() {
      const sync = () => {
        const modalOpen = Boolean(document.querySelector('dialog[open]'));
        this.host.classList.toggle('avatar-widget-host--modal-open', modalOpen);
        this.host.inert = modalOpen;
        this.host.setAttribute('aria-hidden', String(modalOpen));
        if (modalOpen) {
          if (this._isTyping) this.skipTypewriter();
          else if (this.renderer) this.renderer.stopSpeaking();
        }
      };
      sync();
      if (typeof MutationObserver === 'function') {
        this._dialogObserver = new MutationObserver(sync);
        this._dialogObserver.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ['open']
        });
      }
    }

    async open() {
      if (this.host.hidden) return;
      this._returnFocus = this.launcher;
      this.panel.hidden = false;
      this.launcher.hidden = true;
      this.panel.classList.remove('avatar-widget-panel--minimized');
      this.minimizeButton.textContent = '—';
      this.minimizeButton.setAttribute('aria-label', 'Minimizar avatar');
      this.minimizeButton.setAttribute('aria-expanded', 'true');
      this.content.inert = false;
      this.footer.inert = false;
      this.launcher.setAttribute('aria-expanded', 'true');
      document.body.classList.add('avatar-widget-open');

      if (!this.renderer) {
        this.text.textContent = 'Preparando el avatar…';
        this.options.replaceChildren();
        this.nextButton.hidden = true;
        this.renderer = new AvatarRenderer(this.stage, {
          expression: 'neutral',
          idle: true,
          reducedMotion: this._motionDisabled
        });
        this._openingPromise = this.renderer.ready.then(() => true).catch((error) => {
          this.text.textContent = 'No se pudo cargar el avatar. Inténtalo nuevamente más tarde.';
          console.error(error);
          return false;
        });
      }

      const rendererReady = this._openingPromise ? await this._openingPromise : true;
      if (!rendererReady || this._destroyed || this.panel.hidden) return;
      if (!this.currentNode || this._needsResume) {
        const nodeId = this.currentNode && this.currentNode.id
          ? String(this.currentNode.id)
          : String(this.script.start || 'welcome');
        this._needsResume = false;
        await this.goTo(nodeId);
      }
      if (!this.panel.hidden) this.text.focus({ preventScroll: true });
    }

    close(options = {}) {
      if (this._nodePending) {
        this._navigationToken += 1;
        this._nodePending = false;
        this._needsResume = true;
      }
      if (this._isTyping) this.skipTypewriter();
      else if (this.renderer) this.renderer.stopSpeaking();
      this.panel.hidden = true;
      this.launcher.hidden = false;
      this.launcher.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('avatar-widget-open');
      const focusTarget = this._returnFocus && this._returnFocus.isConnected
        ? this._returnFocus
        : this.launcher;
      if (options.focus !== false) focusTarget.focus({ preventScroll: true });
    }

    toggleMinimized() {
      const minimized = this.panel.classList.toggle('avatar-widget-panel--minimized');
      if (minimized) {
        if (this._nodePending) {
          this._navigationToken += 1;
          this._nodePending = false;
          this._needsResume = true;
        }
        if (this._isTyping) this.skipTypewriter();
        else if (this.renderer) this.renderer.stopSpeaking();
        this.minimizeButton.textContent = '□';
        this.minimizeButton.setAttribute('aria-label', 'Restaurar avatar');
        this.minimizeButton.setAttribute('aria-expanded', 'false');
        this.content.inert = true;
        this.footer.inert = true;
        document.body.classList.remove('avatar-widget-open');
      } else {
        this.minimizeButton.textContent = '—';
        this.minimizeButton.setAttribute('aria-label', 'Minimizar avatar');
        this.minimizeButton.setAttribute('aria-expanded', 'true');
        this.content.inert = false;
        this.footer.inert = false;
        document.body.classList.add('avatar-widget-open');
        if (this._needsResume) {
          const nodeId = this.currentNode && this.currentNode.id
            ? String(this.currentNode.id)
            : String(this.script.start || 'welcome');
          this._needsResume = false;
          void this.goTo(nodeId);
        }
      }
      this.minimizeButton.focus({ preventScroll: true });
    }

    hide() {
      this.close({ focus: false });
      this._writeHiddenPreference(true);
      this.host.hidden = true;
    }

    show() {
      this._writeHiddenPreference(false);
      this.host.hidden = false;
      this.launcher.hidden = false;
      this.launcher.focus({ preventScroll: true });
    }

    _cancelTypewriter() {
      this._typingToken += 1;
      this._isTyping = false;
    }

    _chooseParts(text) {
      if (typeof text === 'string') return [text];
      if (!Array.isArray(text) || text.length === 0) return [];
      if (text.every((entry) => typeof entry === 'string')) {
        return [text[Math.floor(Math.random() * text.length)]];
      }
      const variants = text.filter((entry) => Array.isArray(entry) && entry.length > 0);
      if (variants.length === 0) return [];
      return variants[Math.floor(Math.random() * variants.length)].map((part) => String(part));
    }

    _instagramLabel() {
      const url = this.siteConfig.socials && this.siteConfig.socials.instagram;
      if (typeof url !== 'string' || !url.trim()) return 'el Instagram oficial de Gimae';
      try {
        const parsed = new URL(url, document.baseURI);
        if (!['https:', 'http:'].includes(parsed.protocol)) return 'el Instagram oficial de Gimae';
        const handle = parsed.pathname.split('/').filter(Boolean)[0];
        return handle ? `el Instagram oficial @${handle}` : 'el Instagram oficial de Gimae';
      } catch {
        return 'el Instagram oficial de Gimae';
      }
    }

    _eventSummary() {
      const events = Array.isArray(this.siteConfig.events) ? this.siteConfig.events.filter(Boolean) : [];
      if (events.length === 0) return `No hay eventos publicados en content.js; revisa ${this._instagramLabel()}`;
      return events.map((event) => {
        if (typeof event === 'string') return event;
        if (!event || typeof event !== 'object') return '';
        return [event.name || event.title, event.date, event.place].filter(Boolean).join(' · ');
      }).filter(Boolean).join('; ');
    }

    _merchSummary() {
      const products = Array.isArray(this.siteConfig.merch)
        ? this.siteConfig.merch.filter((product) => product && product.active !== false)
        : [];
      if (products.length === 0) return `sin productos publicados; revisa ${this._instagramLabel()}`;
      const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
      return products.map((product) => {
        const prices = Array.isArray(product.prices)
          ? product.prices.map((price) => price && Number.isFinite(price.value) ? money.format(price.value) : '').filter(Boolean)
          : [];
        const price = Number.isFinite(product.price) ? money.format(product.price) : prices.join(' / ');
        return price ? `${String(product.name || 'Producto')} (${price})` : String(product.name || 'Producto');
      }).join(', ');
    }

    _socialSummary() {
      const labels = { instagram: 'Instagram', tiktok: 'TikTok', spotify: 'Spotify' };
      const socials = this.siteConfig.socials && typeof this.siteConfig.socials === 'object'
        ? Object.keys(this.siteConfig.socials).filter((key) => typeof this.siteConfig.socials[key] === 'string' && this.siteConfig.socials[key].trim())
        : [];
      if (socials.length === 0) return this._instagramLabel();
      return socials.map((key) => labels[key] || key).join(', ');
    }

    _resolveTemplate(value) {
      const members = Array.isArray(this.siteConfig.members)
        ? this.siteConfig.members.map((member) => member && member.name).filter(Boolean).join(', ')
        : '';
      const replacements = {
        members: members || 'las integrantes publicadas en content.js',
        events: this._eventSummary(),
        merch: this._merchSummary(),
        socials: this._socialSummary(),
        instagram: this._instagramLabel()
      };
      return String(value || '').replace(/\{\{(members|events|merch|socials|instagram)\}\}/g, (_match, key) => replacements[key]);
    }

    async goTo(nodeId, selectedLabel = '') {
      const node = this.nodes[nodeId];
      if (!node || typeof node !== 'object' || this._destroyed) return;
      const navigationToken = ++this._navigationToken;
      this._nodePending = true;
      this._cancelTypewriter();
      if (this.renderer) this.renderer.stopSpeaking();
      if (selectedLabel) this._appendHistory('Tú', selectedLabel, 'user');
      this.currentNode = node;
      this.currentParts = this._chooseParts(node.text).map((part) => this._resolveTemplate(part));
      this.currentPartIndex = 0;
      const expression = EXPRESSIONS.includes(node.expression) ? node.expression : 'neutral';
      if (this.renderer) await this.renderer.setExpression(expression);
      if (this._destroyed || navigationToken !== this._navigationToken) return;
      this._nodePending = false;
      if (this.panel.hidden || this.panel.classList.contains('avatar-widget-panel--minimized')) {
        this._needsResume = true;
        return;
      }
      this._renderPart();
    }

    _renderPart() {
      const part = this.currentParts[this.currentPartIndex];
      if (typeof part !== 'string') {
        this.text.textContent = 'COMPLETAR: agrega texto para este nodo en content.js.';
        this._renderOptions();
        return;
      }
      this._cancelTypewriter();
      const token = this._typingToken;
      this._isTyping = true;
      this._currentText = part;
      this._partLogged = false;
      this.text.textContent = '';
      this.nextButton.hidden = true;
      this.options.replaceChildren();
      if (this.renderer) void this.renderer.speak(part);

      if (this._isReducedMotion()) {
        this.text.textContent = part;
        this._completePart();
        return;
      }

      void (async () => {
        for (const character of Array.from(part)) {
          await wait(/[.!?¡¿]/u.test(character) ? 110 : /[,;:]/u.test(character) ? 75 : 28);
          if (token !== this._typingToken) return;
          this.text.textContent += character;
        }
        if (token === this._typingToken) this._completePart();
      })();
    }

    skipTypewriter() {
      if (!this._isTyping) return;
      this._typingToken += 1;
      this.text.textContent = this._currentText;
      if (this.renderer) this.renderer.stopSpeaking();
      this._completePart();
    }

    _completePart() {
      this._isTyping = false;
      if (this.renderer) this.renderer.stopSpeaking();
      if (!this._partLogged) {
        this._appendHistory(this.name, this._currentText, 'avatar');
        this._partLogged = true;
      }
      const hasNextPart = this.currentPartIndex < this.currentParts.length - 1;
      this.nextButton.hidden = !hasNextPart;
      if (!hasNextPart) this._renderOptions();
    }

    nextPart() {
      if (this._isTyping) {
        this.skipTypewriter();
        return;
      }
      if (this.currentPartIndex >= this.currentParts.length - 1) return;
      this.currentPartIndex += 1;
      this._renderPart();
      this.text.focus({ preventScroll: true });
    }

    _renderOptions() {
      this.options.replaceChildren();
      const options = Array.isArray(this.currentNode && this.currentNode.options) ? this.currentNode.options : [];
      options.forEach((option) => {
        if (!option || typeof option !== 'object' || !this.nodes[option.target]) return;
        const label = String(option.label || 'Continuar');
        const button = createButton(label, 'avatar-widget-option');
        button.addEventListener('click', () => {
          Array.from(this.options.children).forEach((candidate) => { candidate.disabled = true; });
          void this.goTo(option.target, label);
        });
        this.options.append(button);
      });
    }

    _appendHistory(speaker, message, kind) {
      const entry = document.createElement('p');
      entry.className = `avatar-widget-history__entry avatar-widget-history__entry--${kind}`;
      const name = document.createElement('strong');
      name.textContent = `${String(speaker)}: `;
      const text = document.createElement('span');
      text.textContent = String(message);
      entry.append(name, text);
      this.history.append(entry);
      while (this.history.children.length > 30) this.history.firstElementChild.remove();
      this.history.scrollTop = this.history.scrollHeight;
    }

    destroy() {
      this._destroyed = true;
      this._navigationToken += 1;
      this._nodePending = false;
      this._cancelTypewriter();
      if (this._dialogObserver) this._dialogObserver.disconnect();
      if (typeof this._motionQuery.removeEventListener === 'function') {
        this._motionQuery.removeEventListener('change', this._onMotionPreferenceChange);
      } else {
        this._motionQuery.removeListener(this._onMotionPreferenceChange);
      }
      window.removeEventListener('resize', this._onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._onViewportChange);
        window.visualViewport.removeEventListener('scroll', this._onViewportChange);
      }
      if (this.renderer) this.renderer.destroy();
      document.body.classList.remove('avatar-widget-open');
      this.host.remove();
    }
  }

  function initializeAvatar() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('avatar-debug')) mountDebugPanel();
    const siteConfig = window.GIMAE || {};
    if (!siteConfig.AVATAR_CONFIG || siteConfig.AVATAR_CONFIG.enabled === false) return;
    const widget = new AvatarDialogueWidget(siteConfig);
    window.GIMAE_AVATAR_WIDGET = widget;
  }

  window.AvatarRenderer = AvatarRenderer;
  window.AvatarDialogueWidget = AvatarDialogueWidget;
  window.GIMAE_AVATAR_EXPRESSIONS = EXPRESSIONS;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAvatar, { once: true });
  } else {
    initializeAvatar();
  }
}());
