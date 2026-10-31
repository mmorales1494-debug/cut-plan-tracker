// Minimal DOM/browser stub so data.js + app.js can be loaded under Node and their pure
// logic exercised without a browser. The app has no build step and no framework, so this
// is the whole test rig: load the two scripts into a vm context, then call the functions.
const fs = require("fs");
const vm = require("vm");
const root = require("path").join(__dirname, "..");

function makeEl() {
  const el = {
    addEventListener() {}, setAttribute() {}, removeAttribute() {},
    appendChild() {}, removeChild() {}, click() {}, focus() {}, blur() {},
    querySelector: () => null, querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, dataset: {}, children: [], value: "", innerHTML: "", textContent: "",
    closest: () => null, scrollIntoView() {},
  };
  return el;
}

const store = {};
const ctx = {
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: {
    documentElement: makeEl(),
    body: makeEl(),
    getElementById: () => makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    addEventListener() {},
  },
  navigator: { serviceWorker: { register: () => Promise.resolve(), addEventListener() {} }, wakeLock: undefined },
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: cb => setTimeout(cb, 0),
  indexedDB: { open: () => ({ addEventListener() {} }) },
  AudioContext: function () { return { createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: {} }), createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), destination: {}, currentTime: 0 }; },
  alert: () => {}, confirm: () => true, prompt: () => null, fetch: () => Promise.reject(new Error("no network")),
  Blob: function () {}, URL: { createObjectURL: () => "", revokeObjectURL() {} },
  FileReader: function () {},
  Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise, Error, isNaN, parseInt, parseFloat,
};
ctx.window.localStorage = ctx.localStorage;
ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(fs.readFileSync(root + "/data.js", "utf8"), ctx, { filename: "data.js" });
vm.runInContext(fs.readFileSync(root + "/app.js", "utf8"), ctx, { filename: "app.js" });

// `state` is a top-level `let`, so it lives in the script scope rather than on the
// context object — surface it through an accessor for the tests.
vm.runInContext("Object.defineProperty(globalThis, '__state', { get: () => state, set: v => { state = v; } });", ctx);
Object.defineProperty(ctx, "state", { get: () => ctx.__state, set: v => { ctx.__state = v; } });

module.exports = ctx;
