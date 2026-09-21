import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const avatarSource = fs.readFileSync(path.join(root, 'dist/avatar.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(root, 'dist/content.js'), 'utf8');

assert.match(avatarSource, /class AvatarDialogueWidget/);
assert.match(avatarSource, /avatar-widget-option/);
assert.match(avatarSource, /setAttribute\('role', 'log'\)/);
assert.match(avatarSource, /window\.localStorage/);
assert.match(avatarSource, /setAttribute\('role', 'dialog'\)/);
assert.match(avatarSource, /setAttribute\('aria-modal', 'false'\)/);
assert.match(avatarSource, /setAttribute\('aria-live', 'off'\)/);
assert.match(avatarSource, /Desactivar animaciones/);
assert.match(avatarSource, /window\.visualViewport/);
assert.match(avatarSource, /dialog\[open\]/);
assert.match(avatarSource, /this\.renderer\.stopSpeaking\(\)/);
assert.match(avatarSource, /_navigationToken/);
assert.match(avatarSource, /_failedSprites/);
assert.match(avatarSource, /avatar-renderer__placeholder/);
assert.match(avatarSource, /this\.renderer = new AvatarRenderer\(this\.stage/);
assert.match(avatarSource, /if \(params\.has\('avatar-debug'\)\) mountDebugPanel\(\);/);
assert.doesNotMatch(avatarSource, /mountDebugPanel\(\);\s*return;/);
assert.doesNotMatch(avatarSource, /'(neutral|happy|excited)-talk'/);
assert.match(contentSource, /"AVATAR_SCRIPT"/);
assert.match(contentSource, /COMPLETAR/);

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class MockElement {
  constructor(tag = 'div') {
    this.children = [];
    this.classList = new MockClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.complete = tag === 'img';
    this.naturalWidth = tag === 'img' ? 768 : 0;
    this.srcWrites = 0;
    this.decodeCalls = 0;
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.textContent = '';
  }

  set src(value) {
    this.source = value;
    this.srcWrites += 1;
    const filename = String(value).split('/').pop();
    if (MockElement.failedSprites.has(filename)) {
      this.complete = false;
      this.naturalWidth = 0;
    }
  }

  get src() {
    return this.source || '';
  }

  decode() {
    this.decodeCalls += 1;
    const filename = String(this.source || '').split('/').pop();
    if (MockElement.failedSprites.has(filename)) return Promise.reject(new Error('Fallo simulado'));
    return Promise.resolve();
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  prepend(...nodes) { this.children.unshift(...nodes); }
  contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
  matches() { return false; }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get scrollHeight() {
    return this.children.length;
  }

  get isConnected() {
    return true;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target ||= this;
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
  }

  focus() {
    documentMock.activeElement = this;
  }
}
MockElement.failedSprites = new Set();

const media = {
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {}
};
const documentMock = {
  baseURI: 'https://example.test/gimae-web/',
  readyState: 'loading',
  createElement: (tag) => new MockElement(tag),
  addEventListener() {},
  querySelector: () => null,
  getElementById: () => null,
  removeEventListener() {},
  documentElement: {},
  activeElement: null
};
documentMock.body = new MockElement('body');
const storedValues = new Map();
const windowMock = {
  document: documentMock,
  innerHeight: 900,
  innerWidth: 1440,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  matchMedia: () => media,
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem: (key) => storedValues.get(key) || null,
    setItem: (key, value) => storedValues.set(key, String(value)),
    removeItem: (key) => storedValues.delete(key)
  }
};

Object.assign(globalThis, {
  location: {search:''},
  getComputedStyle: () => ({getPropertyValue: () => '#412d45'}),
  Element: MockElement,
  document: documentMock,
  window: windowMock
});
vm.runInThisContext(avatarSource, { filename: 'dist/avatar.js' });

const renderer = new windowMock.AvatarRenderer(new MockElement(), { crossfadeDuration: 0 });
await renderer.ready;
assert.equal(renderer.layers.size, 11);
assert.equal(renderer.root.getAttribute('aria-hidden'), 'true');
assert.deepEqual([...renderer.layers.keys()].filter((name) => name.endsWith('-talk')), []);
assert.deepEqual([...renderer.layers.keys()].filter((name) => name.endsWith('-mouth')), [
  'neutral-mouth',
  'happy-mouth',
  'excited-mouth'
]);
assert.equal(renderer.layers.get('neutral').parentNode, renderer.layers.get('neutral-mouth').parentNode);
renderer.layers.forEach((layer) => {
  assert.equal(layer.srcWrites, 1);
  assert.equal(layer.decodeCalls, 1);
  assert.equal(layer.alt, '');
  assert.equal(layer.getAttribute('aria-hidden'), 'true');
  assert.match(layer.src, /^https:\/\/example\.test\/gimae-web\/images\/avatar\//);
});

const visible = (className) => [...renderer.layers]
  .filter(([, layer]) => layer.classList.contains(className))
  .map(([name]) => name);
const speaking = renderer.speak('Prueba de la capa de boca.');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.deepEqual(visible('is-visible'), ['neutral']);
assert.deepEqual(visible('is-mouth-visible'), ['neutral-mouth']);
renderer.stopSpeaking();
await speaking;
assert.deepEqual(visible('is-visible'), ['neutral']);
assert.deepEqual(visible('is-mouth-visible'), []);
renderer.destroy();

MockElement.failedSprites = new Set(['happy.webp']);
const originalWarn = console.warn;
console.warn = () => {};
const fallbackRenderer = new windowMock.AvatarRenderer(new MockElement(), { crossfadeDuration: 0 });
await fallbackRenderer.ready;
await fallbackRenderer.setExpression('happy');
assert(fallbackRenderer._failedSprites.has('happy'));
assert.deepEqual([...fallbackRenderer.layers]
  .filter(([, layer]) => layer.classList.contains('is-visible'))
  .map(([name]) => name), ['neutral']);
fallbackRenderer.destroy();
console.warn = originalWarn;
MockElement.failedSprites.clear();

media.matches = true;
const widget = new windowMock.AvatarDialogueWidget({
  AVATAR_CONFIG: {
    enabled: true,
    name: 'Suki',
    label: 'Avatar animado · diálogos predefinidos',
    storageKey: 'test.avatar.hidden'
  },
  AVATAR_SCRIPT: {
    start: 'welcome',
    nodes: {
      welcome: { id: 'welcome', expression: 'happy', text: 'Texto completo.', options: [{ label: 'Seguir', target: 'sad' }] },
      sad: { id: 'sad', expression: 'sad', text: 'Segundo texto.', options: [] },
      thinking: { id: 'thinking', expression: 'thinking', text: 'Texto pendiente.', options: [] }
    }
  },
  members: [{ name: 'Suki', accent: '#e84694' }]
});
assert.equal(widget.panel.getAttribute('role'), 'dialog');
assert.equal(widget.panel.getAttribute('aria-modal'), 'false');
assert.equal(widget.history.getAttribute('role'), 'log');
assert.equal(widget.text.getAttribute('aria-live'), 'off');
widget.launcher.focus();
await widget.open();
assert.equal(documentMock.activeElement, widget.text);
assert.equal(widget.text.textContent, 'Texto completo.');
assert.equal(widget.textMeasure.textContent, 'Texto completo.');
widget.close();
assert.equal(documentMock.activeElement, widget.launcher);

await widget.open();
widget.toggleMinimized();
assert.equal(widget.content.inert, true);
assert.equal(widget.footer.inert, true);
assert.equal(widget.minimizeButton.getAttribute('aria-expanded'), 'false');
widget.toggleMinimized();
assert.equal(widget.content.inert, false);

const originalSetExpression = widget.renderer.setExpression.bind(widget.renderer);
widget.renderer.setExpression = async (expression) => {
  await originalSetExpression(expression);
  if (expression === 'sad') await new Promise((resolve) => setTimeout(resolve, 30));
};
const firstNavigation = widget.goTo('sad');
const lastNavigation = widget.goTo('welcome');
await Promise.all([firstNavigation, lastNavigation]);
assert.equal(widget.currentNode.id, 'welcome');
assert.equal(widget.renderer.expression, 'happy');
assert.equal(widget.text.textContent, 'Texto completo.');

widget.renderer.setExpression = async (expression) => {
  await originalSetExpression(expression);
  if (expression === 'thinking') await new Promise((resolve) => setTimeout(resolve, 30));
};
const pendingNavigation = widget.goTo('thinking');
widget.close({ focus: false });
await pendingNavigation;
assert.equal(widget.panel.hidden, true);
assert.equal(widget._isTyping, false);
assert.equal(widget.renderer._mouthOpen, false);
await widget.open();
assert.equal(widget.currentNode.id, 'thinking');
assert.equal(widget.text.textContent, 'Texto pendiente.');
assert.equal(widget.textMeasure.textContent, 'Texto pendiente.');

widget.panel.dispatchEvent({
  type: 'keydown',
  key: 'Escape',
  preventDefault() {}
});
assert.equal(widget.panel.hidden, true);

// New checks: switching themes must preserve the live dialogue and renderer.
await widget.open();
const savedRenderer = widget.renderer;
const savedText = widget.text.textContent;
const savedHistory = widget.history.children.length;
for (const style of ['pastel-angular','pastel-sticker','default']) {
  widget.setDialogStyle(style);
  assert.equal(widget.host.dataset.dialogStyle, style);
  assert.equal(widget.renderer, savedRenderer);
  assert.equal(widget.text.textContent, savedText);
  assert.equal(widget.history.children.length, savedHistory);
}
widget.setDialogStyle('unknown');
assert.equal(widget.dialogStyle,'default');
widget.setDialogStyle('pastel-angular');
assert.equal(widget.tail.getAttribute('aria-hidden'),'true');
const query = documentMock.querySelector;
documentMock.querySelector = (selector) => selector === 'dialog[open]' ? {} : null;
widget._syncObstructions(); assert.equal(widget.host.inert,true);
documentMock.querySelector = (selector) => selector.includes('menu-toggle') ? {} : null;
widget._syncObstructions(); assert.equal(widget.host.inert,true);
documentMock.querySelector = query;
windowMock.innerWidth = 360;
documentMock.activeElement = {matches:()=>true};
widget._syncObstructions(); assert.equal(widget.host.inert,true);
documentMock.activeElement = null;
widget._syncObstructions(); assert.equal(widget.host.inert,false);
windowMock.visualViewport = {height:300,offsetTop:0};
widget._syncVisualViewport();assert.equal(widget.host.classList.contains('avatar-widget-host--compact'),true);
windowMock.visualViewport = null;
const ratios = {};
for (const [name, color] of Object.entries({Suki:'#e84694',Usi:'#df4d62',Vewe:'#c99a18',Vali:'#8f62bf'})) {
  const palette = windowMock.GIMAE_AVATAR_PALETTE(color);
  assert(palette.ratios.solidText >= 4.5);
  assert(palette.ratios.text >= 4.5);
  assert(palette.ratios.focusOnWhite >= 3);
  assert(palette.ratios.focusOnSoft >= 3);
  assert(palette.ratios.nameplateText >= 4.5);
  if(name==='Vewe') assert.equal(palette.onAccent,'#412d45');
  ratios[name] = palette;
}
console.log('Contraste WCAG:', JSON.stringify(ratios, null, 2));
widget.destroy();
media.matches = false;


console.log('OK: regresiones del avatar');
