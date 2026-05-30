// ============================================================
// config.js — Tweak defaults, density profiles, persistent state.
// Loaded FIRST. Top-level `let`/`const` in classic scripts are
// visible to subsequent inline scripts in the same realm.
// ============================================================

// Tweak defaults — the `EDITMODE-BEGIN/END` markers let the host rewrite
// this block on disk when the user changes a tweak from the in-page console.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "linear",
  "density": "sparse",
  "serif": "editorial",
  "theme": "dark",
  "depth": "shallow"
}/*EDITMODE-END*/;

// Live tweak state — defaults merged with any prior session's localStorage.
const TWEAKS = Object.assign(
  {},
  TWEAK_DEFAULTS,
  JSON.parse(localStorage.getItem('np_tweaks') || '{}')
);

// Density profile -> graph-build parameters
const DENSITY_PROFILES = {
  sparse:   { edgeMult: 0.55, partMult: 0.55, skip: 6,  linkPart: 2 },
  standard: { edgeMult: 1.0,  partMult: 1.0,  skip: 14, linkPart: 3 },
  dense:    { edgeMult: 1.45, partMult: 1.6,  skip: 24, linkPart: 5 },
};

// Visited-anchor persistence (drives the "SEEN" ring + HUD count)
const VISITED = new Set(JSON.parse(localStorage.getItem('np_visited_v2') || '[]'));

// Misc app state used across files
let lastOpened = null;
let lastOpenedAt = 0;
const ragActive = [];   // [{nodeId, until}] — RAG panel pulses
