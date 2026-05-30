// ============================================================
// network.js — Canvas engine. Renders the neural-network graph:
// layers, nodes, edges, particles, pan/zoom, draw loop.
// Depends on: config.js (TWEAKS, VISITED, ragActive), data.js (LAYERS, etc.)
// All functions defer data access to call-time, so this can load before
// data.js's async fetch resolves.
// ============================================================

const canvas = document.getElementById('net');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

// Graph state — populated by buildGraph()
let nodes = [], edges = [], particles = [];

// View / interaction state
const view       = { x:0, y:0, k:1 };
const viewTarget = { x:0, y:0, k:1 };
let viewTweening = false;
const mouse      = { x:0, y:0, hoverNode:null };
let dragging = false, dragStart = null, viewStart = null;
let frozenAnchor = null; // node id whose edges stay lit while panel open

// Layer-index caches (computed in buildGraph, after data is loaded)
let SKILLS_LAYER_IDX   = -1;
let PROJECTS_LAYER_IDX = -1;

// Deterministic RNG so the graph looks the same across rebuilds.
function rng(seed){ let s = seed>>>0; return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; }; }
const R = rng(20260507);

// Theme-aware color helpers (canvas can't read CSS variables directly)
function themeColors(){
  const isLight = TWEAKS.theme === 'light';
  return {
    bg:    isLight ? '#f6f4ef' : '#000',
    fgRgb: isLight ? '17,17,17' : '255,255,255',
    fg:    isLight ? '#111' : '#fff',
  };
}

// ---- Viewport helpers ----
function worldFromScreen(sx, sy){ return { x:(sx - view.x)/view.k, y:(sy - view.y)/view.k }; }
function screenFromWorld(wx, wy){ return { x: wx*view.k + view.x, y: wy*view.k + view.y }; }
function tweenViewTo(tx, ty, tk){ viewTarget.x = tx; viewTarget.y = ty; viewTarget.k = tk; viewTweening = true; }

// ---- 3D depth projection ----
// Each node carries a stable per-node `_zSeed` (set in buildGraph) and an
// active `z0` (set in layout based on the current depth profile). project()
// rotates the world around a slow yaw + small pitch, then applies a simple
// perspective divide — returning coordinates RELATIVE TO THE VIEWPORT CENTER.
// The canvas transform in draw() applies the centering + view.x/y/k afterward.
const cam = { yaw: 0 };
const DEPTH_PROFILES = {
  flat:    { jitter: 0,   parallax: 0,    autoAmp: 0,    autoFreq: 0,    pitch: 0,     focal: 9999 },
  shallow: { jitter: 42,  parallax: 0.18, autoAmp: 0.05, autoFreq: 0.10, pitch: -0.07, focal: 1500 },
  deep:    { jitter: 120, parallax: 0.45, autoAmp: 0.13, autoFreq: 0.08, pitch: -0.12, focal: 1100 },
};
function depthProfile(){ return DEPTH_PROFILES[TWEAKS.depth] || DEPTH_PROFILES.flat; }

function project(x, y, z, time){
  const prof = depthProfile();
  if(prof.jitter === 0 && prof.parallax === 0){
    // Flat: identity (centered on viewport).
    return { sx: x - W/2, sy: y - H/2, scale: 1, zCam: 0 };
  }
  // Freeze rotation while a panel is open so the connector + pan-to-node
  // logic doesn't drift.
  const overlayEl = document.getElementById('overlay');
  const isPanelOpen = overlayEl && overlayEl.classList.contains('open');
  const mouseYaw = isPanelOpen ? 0 : ((mouse.x - W/2) / Math.max(W, 1)) * prof.parallax;
  const autoYaw  = isPanelOpen ? 0 : Math.sin(time * prof.autoFreq) * prof.autoAmp;
  const yaw   = cam.yaw + mouseYaw + autoYaw;
  const pitch = prof.pitch;
  let X = x - W/2;
  let Y = y - H/2;
  let Z = z;
  // Rotate around Y axis (yaw)
  const cyR = Math.cos(yaw), syR = Math.sin(yaw);
  const X1 =  X*cyR + Z*syR;
  const Z1 = -X*syR + Z*cyR;
  // Rotate around X axis (pitch)
  const cpR = Math.cos(pitch), spR = Math.sin(pitch);
  const Y1 = Y*cpR - Z1*spR;
  const Z2 = Y*spR + Z1*cpR;
  const scale = prof.focal / (prof.focal + Z2);
  return { sx: X1*scale, sy: Y1*scale, scale, zCam: Z2 };
}

// Screen position of a node after view transform — used for hit testing and
// for screen-space overlays like the panel connector.
function nodeScreenPos(n){
  return {
    x: (W/2 + view.x) + (n.sx ?? (n.x0 - W/2)) * view.k,
    y: (H/2 + view.y) + (n.sy ?? (n.y0 - H/2)) * view.k,
  };
}

// ---- Resize + layout ----
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth  = window.innerWidth;
  H = canvas.clientHeight = window.innerHeight;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout();
}

function layout(){
  if(!LAYERS.length) return;
  LAYERS.forEach(L => (L._nodes || []).forEach(n => { n.x0 = 0; n.y0 = 0; n.z0 = 0; }));
  const mode = TWEAKS.layout;
  const N    = LAYERS.length;
  const prof = depthProfile();

  // Apply 2D layout first (sets x0, y0)
  if(mode === 'radial'){
    const cx = W/2, cy = H/2;
    const maxR = Math.min(W, H) * 0.36;
    const minR = maxR * 0.20;
    LAYERS.forEach((L, li) => {
      const r   = maxR - (maxR - minR) * (li/(N-1));
      const rot = li * 0.18 - Math.PI/2;
      L._nodes.forEach((n, i) => {
        const a = (i/L.count) * Math.PI*2 + rot;
        n.x0 = cx + r*Math.cos(a);
        n.y0 = cy + r*Math.sin(a);
      });
    });
  } else if(mode === 'stack'){
    const padY    = Math.max(110, H*0.12);
    const usableH = H - padY*2;
    const padX    = Math.max(140, W*0.12);
    const usableW = W - padX*2;
    LAYERS.forEach((L, li) => {
      const y = padY + (usableH * (li/(N-1)));
      L._nodes.forEach((n, i) => {
        const t = L.count === 1 ? 0.5 : i/(L.count-1);
        n.x0 = padX + usableW*t;
        n.y0 = y;
      });
    });
  } else {
    // default: linear left → right
    const padX    = Math.max(140, W*0.10);
    const usableW = W - padX*2;
    const padY    = Math.max(120, H*0.16);
    const usableH = H - padY*2;
    LAYERS.forEach((L, li) => {
      const x = padX + (usableW * (li/(N-1)));
      L._nodes.forEach((n, i) => {
        const t = L.count === 1 ? 0.5 : i/(L.count-1);
        const y = padY + usableH*t;
        n.x0 = x; n.y0 = y;
      });
    });
  }

  // Apply 3D depth jitter on top of the 2D positions. Anchors stay on the
  // central plane (z=0) so they remain the visual focal points; named nodes
  // get half-jitter; plain nodes get full jitter.
  LAYERS.forEach(L => L._nodes.forEach(n => {
    if(n._zSeed == null) n._zSeed = 0;
    if(n.kind === 'anchor')      n.z0 = 0;
    else if(n.kind === 'named')  n.z0 = n._zSeed * prof.jitter * 0.6;
    else                         n.z0 = n._zSeed * 2 * prof.jitter;
  }));
}

// ---- Graph construction ----
function buildGraph(){
  nodes = []; edges = [];
  const profile = DENSITY_PROFILES[TWEAKS.density] || DENSITY_PROFILES.standard;

  let nid = 0;
  LAYERS.forEach((L, li) => {
    const namedByIdx = new Map();
    (L.named || []).forEach(n => namedByIdx.set(n.i, n));
    const layerNodes = [];
    for(let i = 0; i < L.count; i++){
      const isAnchor = L.anchor && L.anchor.i === i;
      const named    = namedByIdx.get(i) || null;
      let baseR;
      if(isAnchor)      baseR = 9;
      else if(named)    baseR = 4.2 + R()*0.6;
      else              baseR = 1.4 + R()*1.6;
      layerNodes.push({
        id: nid++, layer: li, idxInLayer: i,
        kind: isAnchor ? 'anchor' : (named ? 'named' : 'plain'),
        baseR,
        phase: R()*Math.PI*2,
        freq:  0.6 + R()*0.9,
        anchor: isAnchor ? L.anchor : null,
        named,
        layerLabel: L.id,
        jx: (R()-0.5)*0.18, jy: (R()-0.5)*0.18,
        _zSeed: R() - 0.5,  // stable random for 3D depth jitter
        x: 0, y: 0, z0: 0,
      });
    }
    L._nodes = layerNodes;
    nodes.push(...layerNodes);
  });

  // Lookup tables for cross-layer edges
  const skillsLayer   = LAYERS.find(L => L.anchor && L.anchor.key === 'skills');
  const projectsLayer = LAYERS.find(L => L.anchor && L.anchor.key === 'projects');
  const skillNodeByKey   = new Map();
  const projectNodeByKey = new Map();
  skillsLayer._nodes.forEach(n   => { if(n.named) skillNodeByKey.set(n.named.key, n); });
  projectsLayer._nodes.forEach(n => { if(n.named) projectNodeByKey.set(n.named.key, n); });

  // Cache layer-indices for the highlight set in draw()
  SKILLS_LAYER_IDX   = LAYERS.findIndex(L => L.anchor && L.anchor.key === 'skills');
  PROJECTS_LAYER_IDX = LAYERS.findIndex(L => L.anchor && L.anchor.key === 'projects');

  // Dense layer-to-layer edges (probabilistic, scaled by density)
  for(let li = 0; li < LAYERS.length-1; li++){
    const A = LAYERS[li]._nodes, B = LAYERS[li+1]._nodes;
    const aBottomIdx = A.length - 1;
    const bBottomIdx = B.length - 1;
    // CONTACT → KELEX is handled explicitly below as a convergence funnel.
    const isContactToKelex =
      A[0].layerLabel.endsWith('05') && B[0].layerLabel.endsWith('06');
    if(isContactToKelex) continue;
    A.forEach(a => {
      B.forEach(b => {
        // Skip edges between the bottom-most node of each adjacent layer —
        // their identical y positions would draw a horizontal line across
        // the bottom of the network.
        if(a.idxInLayer === aBottomIdx && b.idxInLayer === bBottomIdx) return;
        // Bio's named-skill links are added explicitly below — avoid
        // duplicating them through the probabilistic pass. (The dedupe at
        // end of buildGraph would also catch this, but skipping is cleaner.)
        const isBioToNamedSkill =
          ((a.anchor && a.anchor.key === 'bio') && b.named) ||
          ((b.anchor && b.anchor.key === 'bio') && a.named);
        if(isBioToNamedSkill) return;
        const baseP = (a.anchor || b.anchor) ? 0.78 : 0.55;
        const p     = Math.min(0.95, baseP * profile.edgeMult);
        if(R() < p){
          edges.push({a:a.id, b:b.id, w:0.15+R()*0.5, phase:R()*Math.PI*2, freq:.5+R()});
        }
      });
    });
  }
  // Skip-layer edges for texture
  for(let i = 0; i < profile.skip; i++){
    const li = Math.floor(R()*(LAYERS.length-2));
    const A = LAYERS[li]._nodes, B = LAYERS[li+2]._nodes;
    const a = A[Math.floor(R()*A.length)], b = B[Math.floor(R()*B.length)];
    // Bio's only skip-layer connection is the explicit rag-skip below.
    if((a.anchor && a.anchor.key === 'bio') || (b.anchor && b.anchor.key === 'bio')) continue;
    edges.push({a:a.id, b:b.id, w:0.1+R()*0.25, phase:R()*Math.PI*2, freq:.3+R()*.6, skip:true});
  }

  // Explicit project ↔ skill links (the headline feature)
  Object.entries(PROJECT_SKILLS).forEach(([projKey, skillKeys]) => {
    const pn = projectNodeByKey.get(projKey);
    if(!pn) return;
    skillKeys.forEach(sk => {
      const sn = skillNodeByKey.get(sk);
      if(!sn) return;
      edges.push({a: sn.id, b: pn.id, w: 0.9, phase: R()*Math.PI*2, freq: 0.7+R()*0.4, kind: 'link'});
    });
  });

  // Biography ↔ every named skill (solid links) + every plain skill (regular)
  // + dotted skip Biography → RAG_ARCHIVE. Deterministic so the fan-out is
  // fully visible even at sparse density.
  const bioNode = LAYERS[0]._nodes.find(n => n.anchor && n.anchor.key === 'bio');
  const skillsLayerForBio = LAYERS.find(L => L.anchor && L.anchor.key === 'skills');
  const ragLayer = LAYERS.find(L => L.anchor && L.anchor.key === 'rag');
  const ragNode  = ragLayer && ragLayer._nodes.find(n => n.anchor && n.anchor.key === 'rag');
  if(bioNode){
    for(const sn of skillNodeByKey.values()){
      edges.push({a:bioNode.id, b:sn.id, w:0.95, phase:R()*Math.PI*2, freq:0.55+R()*0.35, kind:'link'});
    }
    // Also connect to every PLAIN node in the skills layer so the bio
    // anchor fans out fully across the column. Plain edges use the regular
    // (non-link) kind — they read as background texture, not headline links.
    for(const sn of skillsLayerForBio._nodes){
      if(sn.kind === 'plain'){
        edges.push({a:bioNode.id, b:sn.id, w:0.4, phase:R()*Math.PI*2, freq:0.5+R()*0.5});
      }
    }
    if(ragNode){
      edges.push({a:bioNode.id, b:ragNode.id, w:0.6, phase:R()*Math.PI*2, freq:0.35+R()*0.25, kind:'rag-skip'});
    }
  }

  // CONTACT → KELEX convergence: every node in the contact layer feeds
  // into the single KELEX anchor, forming a clean funnel into the output.
  const contactLayer = LAYERS.find(L => L.anchor && L.anchor.key === 'contact');
  const kelexNode    = LAYERS.find(L => L.anchor && L.anchor.key === 'rag')
                            ._nodes.find(n => n.anchor && n.anchor.key === 'rag');
  if(contactLayer && kelexNode){
    contactLayer._nodes.forEach(cn => {
      const isContactAnchor = cn.anchor && cn.anchor.key === 'contact';
      edges.push({
        a: cn.id, b: kelexNode.id,
        w: isContactAnchor ? 0.95 : 0.55,
        phase: R()*Math.PI*2,
        freq: 0.55 + R()*0.35,
        ...(isContactAnchor ? { kind: 'link' } : {}),
      });
    });
  }

  // Skills ANCHOR → every node in the PROJECTS layer. Mirrors the bio
  // fan-out one layer over so the network reads as: BIO → SKILLS → PROJECTS,
  // each layer fully wired to the next via its anchor.
  const skillsAnchorNode = skillsLayer._nodes.find(n => n.anchor && n.anchor.key === 'skills');
  if(skillsAnchorNode){
    for(const pn of projectsLayer._nodes){
      if(pn === skillsAnchorNode) continue;
      const kind = pn.named ? 'link' : undefined;
      edges.push({
        a: skillsAnchorNode.id, b: pn.id,
        w: kind ? 0.9 : 0.4,
        phase: R()*Math.PI*2,
        freq: 0.55 + R()*0.35,
        ...(kind ? { kind } : {}),
      });
    }
  }

  // Projects ANCHOR ← every node in the SKILLS layer. Symmetric pull-in
  // from the previous layer — every skill (named and plain) feeds the
  // PROJECTS anchor so it reads as the convergence point of the column.
  const projectsAnchorNode = projectsLayer._nodes.find(n => n.anchor && n.anchor.key === 'projects');
  if(projectsAnchorNode){
    for(const sn of skillsLayer._nodes){
      if(sn === skillsAnchorNode) continue; // already linked above
      // Plain skill → projects anchor is regular; named skill → projects
      // anchor is a solid link (each named skill already links to the
      // specific projects that consume it, this is an additional roll-up).
      const kind = sn.named ? 'link' : undefined;
      edges.push({
        a: sn.id, b: projectsAnchorNode.id,
        w: kind ? 0.85 : 0.4,
        phase: R()*Math.PI*2,
        freq: 0.55 + R()*0.35,
        ...(kind ? { kind } : {}),
      });
    }
  }

  // CV ANCHOR ← every node in the PROJECTS layer. Same pattern — every
  // project (named and plain) rolls up into CV as the next convergence
  // point. Named projects use solid links, plain ones use regular edges.
  const cvLayer = LAYERS.find(L => L.anchor && L.anchor.key === 'cv');
  const cvAnchorNode = cvLayer && cvLayer._nodes.find(n => n.anchor && n.anchor.key === 'cv');
  if(cvAnchorNode){
    for(const pn of projectsLayer._nodes){
      if(pn === projectsAnchorNode) continue; // anchor↔anchor handled by adjacent-layer pass
      const kind = pn.named ? 'link' : undefined;
      edges.push({
        a: pn.id, b: cvAnchorNode.id,
        w: kind ? 0.85 : 0.4,
        phase: R()*Math.PI*2,
        freq: 0.55 + R()*0.35,
        ...(kind ? { kind } : {}),
      });
    }
  }

  // === De-duplicate: keep only one edge per unordered (a,b) pair. ===
  // When multiple kinds collide (e.g. a regular adjacent-layer edge AND an
  // explicit project↔skill link between the same nodes), keep the most
  // expressive: link > rag-skip > skip > regular.
  const rank = (e) => e.kind === 'link' ? 4 : e.kind === 'rag-skip' ? 3 : e.skip ? 2 : 1;
  const byPair = new Map();
  for(const e of edges){
    const key = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
    const prev = byPair.get(key);
    if(!prev || rank(e) > rank(prev)) byPair.set(key, e);
  }
  edges = [...byPair.values()];

  // Attach atmospheric asides to EVERY plain node in those layers
  Object.keys(ASIDES).forEach(layerKey => {
    const L = LAYERS.find(x => x.anchor && x.anchor.key === layerKey);
    if(!L) return;
    L._nodes.forEach(node => { if(node.kind === 'plain') node.aside = { layerKey }; });
  });

  // Particles per edge — denser on links, scaled by density profile
  particles = edges.flatMap((e, ei) => {
    let n;
    if(e.kind === 'link')          n = profile.linkPart;
    else if(e.kind === 'rag-skip') n = 2;
    else if(e.skip)                n = Math.max(1, Math.round(profile.partMult));
    else                           n = Math.max(1, Math.round((1+Math.floor(R()*2)) * profile.partMult));
    const arr = [];
    for(let i = 0; i < n; i++) arr.push({e: ei, t: R(), v: 0.07 + R()*0.14});
    return arr;
  });

  document.getElementById('ncount').textContent = String(nodes.length).padStart(3,'0');
  document.getElementById('ecount').textContent = String(edges.length).padStart(3,'0');

  // Expose RAG layer's node list for rag.js's activation pulses
  window.__RAG_LAYER_NODES = LAYERS.find(L => L.anchor && L.anchor.key === 'rag')._nodes;
}

// Helper used by panel header to show node degree
function edgesTouching(id){
  let c = 0;
  for(const e of edges) if(e.a === id || e.b === id) c++;
  return String(c).padStart(3, '0');
}

// ---- Kelex glyph ----
// A skeletal sceptre symbol: top teardrop loop, ribbed leaf-body with
// scalloped bottom edge, central spine that continues as a long staff.
// All single-weight strokes — same B&W vocabulary as the rest of the network.
function drawKelexGlyph(ctx, cx, cy, scale, opts){
  const { isHl, dim, isVisited, FG, FGR } = opts;
  const baseA = dim ? 0.32 : 1;
  const alpha = isHl ? 1 : baseA;

  // Section heights (all scaled by perspective)
  const hLoop  = 13.0 * scale;
  const hBody  = 22.0 * scale;
  const hStaff = 20.0 * scale;
  const H      = hLoop + hBody + hStaff;
  const wBody  = 17.0 * scale;   // half-width of leaf body at widest
  const wLoop  = 5.5  * scale;   // half-width of teardrop

  const yTop      = cy - H/2;
  const yLoopBot  = yTop + hLoop;     // bottom point of teardrop = top of leaf spine
  const yBodyBot  = yLoopBot + hBody; // bottom of leaf cusps
  const yStaffBot = yBodyBot + hStaff;
  const yMid      = (yLoopBot + yBodyBot) / 2;

  ctx.strokeStyle = `rgba(${FGR},${alpha.toFixed(3)})`;
  ctx.lineWidth   = (1.3 / view.k) * (isHl ? 1.4 : 1);
  ctx.lineCap     = 'butt';
  ctx.lineJoin    = 'miter';

  // --- 1. Top teardrop loop (rounded top, point at bottom) ---
  ctx.beginPath();
  ctx.moveTo(cx, yLoopBot);
  ctx.bezierCurveTo(
    cx + wLoop * 1.3, yLoopBot - hLoop * 0.30,
    cx + wLoop,       yTop     + hLoop * 0.10,
    cx,               yTop
  );
  ctx.bezierCurveTo(
    cx - wLoop,       yTop     + hLoop * 0.10,
    cx - wLoop * 1.3, yLoopBot - hLoop * 0.30,
    cx,               yLoopBot
  );
  ctx.stroke();

  // --- 2. Leaf body outline: two side-curves from top to side cusps,
  //        then two sagging arches across the bottom meeting at center cusp.
  const sideCuspXR = cx + wBody * 0.88;
  const sideCuspXL = cx - wBody * 0.88;
  const sideCuspY  = yBodyBot - hBody * 0.02;
  const centerCY   = yBodyBot - hBody * 0.20;

  // Right side outline
  ctx.beginPath();
  ctx.moveTo(cx, yLoopBot);
  ctx.bezierCurveTo(
    cx + wBody * 0.85, yLoopBot + hBody * 0.05,
    cx + wBody,        yMid     - hBody * 0.05,
    sideCuspXR,        sideCuspY
  );
  ctx.stroke();

  // Left side outline (mirror)
  ctx.beginPath();
  ctx.moveTo(cx, yLoopBot);
  ctx.bezierCurveTo(
    cx - wBody * 0.85, yLoopBot + hBody * 0.05,
    cx - wBody,        yMid     - hBody * 0.05,
    sideCuspXL,        sideCuspY
  );
  ctx.stroke();

  // Right bottom arch (sags below the side cusp, rises to center cusp)
  ctx.beginPath();
  ctx.moveTo(sideCuspXR, sideCuspY);
  ctx.bezierCurveTo(
    sideCuspXR - wBody * 0.22, yBodyBot + hBody * 0.10,
    cx         + wBody * 0.25, yBodyBot + hBody * 0.10,
    cx,                        centerCY
  );
  ctx.stroke();

  // Left bottom arch
  ctx.beginPath();
  ctx.moveTo(cx, centerCY);
  ctx.bezierCurveTo(
    cx         - wBody * 0.25, yBodyBot + hBody * 0.10,
    sideCuspXL + wBody * 0.22, yBodyBot + hBody * 0.10,
    sideCuspXL,                sideCuspY
  );
  ctx.stroke();

  // --- 3. Central spine + staff ---
  ctx.beginPath();
  ctx.moveTo(cx, yLoopBot);
  ctx.lineTo(cx, yStaffBot);
  ctx.stroke();

  // --- 4. Diagonal ribs (6 per side, angled down-and-outward) ---
  const numRibs = 6;
  const ribTop  = yLoopBot + hBody * 0.10;
  const ribBot  = centerCY - hBody * 0.05;
  const ribAlpha = (alpha * 0.92).toFixed(3);
  ctx.strokeStyle = `rgba(${FGR},${ribAlpha})`;

  // Leaf width as a function of normalized vertical position (0=top, 1=cusps).
  // Curve grows quickly from top, plateaus near the middle, narrows toward cusps.
  const leafWidthAt = (yt) => {
    if(yt < 0.45) return wBody * (yt / 0.45);
    if(yt < 0.88) return wBody * (1 - (yt - 0.45) * 0.10 / 0.43);
    return wBody * (0.90 - (yt - 0.88) * 0.18 / 0.12);
  };
  for(let i = 0; i < numRibs; i++){
    const t       = i / (numRibs - 1);
    const spineY  = ribTop + t * (ribBot - ribTop);
    const yt      = (spineY - yLoopBot) / hBody;
    const outX    = leafWidthAt(yt) * 0.86;
    const outlineY = spineY + hBody * 0.11;  // angled down-out

    ctx.beginPath();
    ctx.moveTo(cx, spineY);
    ctx.lineTo(cx + outX, outlineY);
    ctx.moveTo(cx, spineY);
    ctx.lineTo(cx - outX, outlineY);
    ctx.stroke();
  }

  // --- 5. Visited indicator: small filled dot at the leaf's focal point ---
  if(isVisited){
    ctx.fillStyle = `rgba(${FGR},${(alpha * 0.85).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, yMid, Math.max(0.8, 1.4 * scale), 0, Math.PI*2);
    ctx.fill();
  }
}

// ---- Animation loop + draw ----
let lastT = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;

function frame(t){
  const dt = Math.min(0.05, (t - lastT)/1000);
  lastT = t;
  fpsAcc += 1/dt; fpsFrames++; fpsTimer += dt;
  if(fpsTimer > 0.4){
    document.getElementById('fps').textContent = String(Math.round(fpsAcc/fpsFrames)).padStart(2,'0');
    fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
  }
  draw(t/1000);
  requestAnimationFrame(frame);
}

function draw(time){
  const TC = themeColors();
  const BG = TC.bg, FG = TC.fg, FGR = TC.fgRgb;

  // Smooth view tween toward viewTarget
  if(viewTweening){
    const lerp = 0.15;
    view.x += (viewTarget.x - view.x)*lerp;
    view.y += (viewTarget.y - view.y)*lerp;
    view.k += (viewTarget.k - view.k)*lerp;
    if(Math.abs(viewTarget.x-view.x) < 0.4 && Math.abs(viewTarget.y-view.y) < 0.4 && Math.abs(viewTarget.k-view.k) < 0.002){
      view.x = viewTarget.x; view.y = viewTarget.y; view.k = viewTarget.k;
      viewTweening = false;
    }
  }

  // Subtle breathing on every node + 3D projection.
  // After this loop, each node has: .x/.y (animated 2D world coords) and
  // .sx/.sy/.scale/.zCam (viewport-centered screen-space + perspective info).
  for(const n of nodes){
    const wob = Math.sin(time*0.3 + n.phase)*4 + Math.cos(time*0.21 + n.phase*1.3)*3;
    n.x = n.x0 + n.jx*wob;
    n.y = n.y0 + n.jy*wob*1.3;
    const wobAmp = n.kind === 'anchor' ? 1.4 : (n.kind === 'named' ? 0.9 : 0.5);
    const baseRadius = n.baseR + Math.sin(time*n.freq + n.phase)*wobAmp;
    const proj = project(n.x, n.y, n.z0, time);
    n.sx = proj.sx; n.sy = proj.sy; n.scale = proj.scale; n.zCam = proj.zCam;
    n.r = baseRadius * proj.scale;
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Expire stale RAG activations
  for(let i = ragActive.length-1; i >= 0; i--){
    if(ragActive[i].until < time) ragActive.splice(i, 1);
  }
  const ragSet = new Set(ragActive.map(a => a.nodeId));

  ctx.save();
  // World is now in viewport-centered space (project() returns sx/sy centered
  // on viewport). Apply pan + zoom around the viewport center.
  ctx.translate(W/2 + view.x, H/2 + view.y);
  ctx.scale(view.k, view.k);

  // Highlight set + edge focus
  // - `highlight` keeps nodes from being dimmed
  // - `hoverFocusId` (when set) restricts edge highlighting to edges that
  //   directly touch THIS node, not the transitive closure
  let highlight = null;
  let hoverFocusId = null;
  const panelOpen = document.getElementById('overlay').classList.contains('open');

  if(!panelOpen && mouse.hoverNode){
    const h = mouse.hoverNode;
    highlight = new Set([h.id]);
    hoverFocusId = h.id;
    if(h.named){
      // Keep the link partners undimmed so labels stay legible,
      // but DO NOT include them in edge-highlighting logic.
      edges.forEach(e => {
        if(e.kind === 'link' && (e.a === h.id || e.b === h.id)){
          highlight.add(e.a); highlight.add(e.b);
        }
      });
    }
  } else if(frozenAnchor != null){
    const fn = nodes[frozenAnchor];
    highlight = new Set([frozenAnchor]);
    if(fn.anchor && (fn.anchor.key === 'skills' || fn.anchor.key === 'projects')){
      nodes.forEach(n => { if(n.named && (n.layer === SKILLS_LAYER_IDX || n.layer === PROJECTS_LAYER_IDX)) highlight.add(n.id); });
    }
  }
  if(ragSet.size){
    if(!highlight) highlight = new Set();
    ragSet.forEach(id => highlight.add(id));
    const out = nodes.find(n => n.anchor && n.anchor.key === 'contact');
    if(out) highlight.add(out.id);
  }

  // Edges — sorted back-to-front by midpoint depth so closer edges occlude.
  const edgeOrder = edges.map((_, i) => i);
  edgeOrder.sort((i1, i2) => {
    const m1 = (nodes[edges[i1].a].zCam + nodes[edges[i1].b].zCam) / 2;
    const m2 = (nodes[edges[i2].a].zCam + nodes[edges[i2].b].zCam) / 2;
    return m2 - m1;
  });
  for(const ei of edgeOrder){
    const e = edges[ei];
    const a = nodes[e.a], b = nodes[e.b];
    const isLink    = e.kind === 'link';
    const isRagSkip = e.kind === 'rag-skip';
    const isHl = hoverFocusId != null
      ? (a.id === hoverFocusId || b.id === hoverFocusId)
      : (highlight && (highlight.has(a.id) || highlight.has(b.id)));
    const dim  = (hoverFocusId != null || highlight) && !isHl;
    const flick = 0.5 + 0.5*Math.sin(time*e.freq + e.phase);
    let baseAlpha;
    if(isLink)         baseAlpha = 0.45 + flick*0.15;
    else if(isRagSkip) baseAlpha = 0.40 + flick*0.18;
    else               baseAlpha = (e.skip ? 0.10 : 0.18) + e.w*0.18 + flick*0.10;
    // Atmospheric perspective: edges further back fade slightly.
    const midScale = (a.scale + b.scale) / 2;
    const depthFade = Math.max(0.55, Math.min(1, midScale));
    const alpha = isHl ? ((isLink||isRagSkip)?1:0.95) : (dim ? ((isLink||isRagSkip)?0.22:0.05) : baseAlpha*depthFade);
    ctx.strokeStyle = `rgba(${FGR},${alpha.toFixed(3)})`;
    ctx.lineWidth = 1/view.k;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  // Particles
  for(const p of particles){
    const e = edges[p.e];
    const a = nodes[e.a], b = nodes[e.b];
    const onFrozen = frozenAnchor != null && (a.id === frozenAnchor || b.id === frozenAnchor);
    const onRag    = ragSet.has(a.id) || ragSet.has(b.id);
    if(!(panelOpen && onFrozen && !onRag)){
      const speed = panelOpen ? (onRag ? 1.6 : 0) : 1;
      p.t += p.v*0.02*speed*60*(1/60);
    }
    if(p.t > 1) p.t -= 1;
    const tt = (onFrozen && !onRag) ? 0.5 + 0.5*Math.sin(time*1.4 + p.t*Math.PI*2) : p.t;
    // Interpolate in projected screen-space — fine for short edges.
    const sx = a.sx + (b.sx - a.sx)*tt;
    const sy = a.sy + (b.sy - a.sy)*tt;
    const isHl   = highlight && (highlight.has(a.id) || highlight.has(b.id));
    const isLink = e.kind === 'link' || e.kind === 'rag-skip';
    ctx.fillStyle = (isHl || isLink) ? FG : `rgba(${FGR},0.85)`;
    const midScale = (a.scale + b.scale) / 2;
    const r = ((isHl||onRag) ? 1.7 : (isLink ? 1.3 : 1.1)) * midScale / Math.sqrt(view.k);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI*2);
    ctx.fill();
  }

  // Nodes — sorted back-to-front for clean occlusion.
  const nodeOrder = nodes.map((_, i) => i).sort((i1, i2) => nodes[i2].zCam - nodes[i1].zCam);
  for(const ni of nodeOrder){
    const n = nodes[ni];
    const isHl = highlight && highlight.has(n.id);
    const dim  = highlight && !isHl;
    const isRagActive = ragSet.has(n.id);

    // Kelex anchor renders as a vesica/eye glyph instead of the standard circle.
    if(n.anchor && n.anchor.key === 'rag'){
      drawKelexGlyph(ctx, n.sx, n.sy, n.scale, {
        isHl, dim,
        isVisited: VISITED.has(n.anchor.key),
        FG, FGR,
      });
      if(isRagActive){
        const pulse = 0.5 + 0.5*Math.sin(time*4 + n.phase);
        ctx.strokeStyle = `rgba(${FGR},${0.4+pulse*0.5})`;
        ctx.lineWidth   = 1.2/view.k;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, (20 + pulse*8) * n.scale, 0, Math.PI*2);
        ctx.stroke();
      }
      continue;
    }

    ctx.fillStyle   = BG;
    ctx.strokeStyle = `rgba(${FGR},${dim?0.22:1})`;
    ctx.lineWidth   = (n.kind === 'anchor' ? 1.2 : (n.kind === 'named' ? 1.1 : 0.9))/view.k;
    ctx.beginPath();
    ctx.arc(n.sx, n.sy, n.r, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    if(n.kind === 'anchor'){
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, n.r+5*n.scale, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(${FGR},${dim?0.12:0.55})`;
      ctx.lineWidth   = 0.8/view.k;
      ctx.stroke();
      ctx.fillStyle = FG;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 1.6*n.scale, 0, Math.PI*2);
      ctx.fill();
      if(VISITED.has(n.anchor.key)){
        ctx.strokeStyle = `rgba(${FGR},${dim?0.25:0.9})`;
        ctx.lineWidth   = 1.4/view.k;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, Math.max(0.5, n.r-2.5*n.scale), 0, Math.PI*2);
        ctx.stroke();
      }
    } else if(n.kind === 'named'){
      ctx.fillStyle = `rgba(${FGR},${dim?0.4:1})`;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, 1.2*n.scale, 0, Math.PI*2);
      ctx.fill();
    }

    if(isRagActive){
      const pulse = 0.5 + 0.5*Math.sin(time*4 + n.phase);
      ctx.strokeStyle = `rgba(${FGR},${0.4+pulse*0.5})`;
      ctx.lineWidth   = 1.2/view.k;
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, n.r + (4 + pulse*5)*n.scale, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // Node labels (drawn at the projected screen position so they ride along
  // with depth). Font size scales modestly with depth so far nodes recede.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for(const n of nodes){
    const dim = highlight && !highlight.has(n.id);
    const s   = n.scale; // for label scaling
    if(n.kind === 'anchor'){
      const fs = Math.max(11, Math.round(16 * s));
      ctx.font = `bold ${fs}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},${dim?0.4:1})`;
      // Kelex glyph is taller than a normal anchor circle — push the label
      // a few extra px so it sits below the staff.
      const isKelex = n.anchor.key === 'rag';
      const labelY = isKelex ? (n.sy + 28*s + 10*s) : (n.sy + n.r + 12*s);
      const subY   = isKelex ? (n.sy + 28*s + 28*s) : (n.sy + n.r + 36*s);
      ctx.fillText(`[${n.anchor.name}]`, n.sx, labelY);
      ctx.font = `${Math.max(8, Math.round(10*s))}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},${dim?0.25:0.55})`;
      const visTag = VISITED.has(n.anchor.key) ? '· SEEN' : '';
      ctx.fillText(`NODE_${String(n.id).padStart(3,'0')} ${visTag}`, n.sx, subY);
    } else if(n.kind === 'named'){
      ctx.textBaseline = 'bottom';
      const fs = Math.max(9, Math.round(12 * s));
      ctx.font = `${fs}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},${dim?0.4:0.95})`;
      ctx.fillText(n.named.label, n.sx, n.sy - n.r - 6*s);
      ctx.textBaseline = 'top';
    } else if((n.id % 7) === 0){
      ctx.font = `${Math.max(8, Math.round(10*s))}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},${dim?0.22:0.38})`;
      ctx.fillText(`n${n.id}`, n.sx, n.sy + n.r + 6*s);
    }
  }

  // Layer labels (axis) — projected at z=0 so they sit on the central plane
  // and don't swing wildly with rotation.
  if(TWEAKS.layout !== 'radial'){
    LAYERS.forEach((L) => {
      const layerX  = L._nodes[0].x0;
      const topNodeY = Math.min(...L._nodes.map(n => n.y0));
      const anchorY = TWEAKS.layout === 'stack' ? L._nodes[0].y0 - 40 : (topNodeY - 64);
      const p = project(layerX, anchorY, 0, time);
      const lx = p.sx, ly = p.sy;
      const fs = Math.max(11, Math.round(14 * p.scale));
      ctx.font = `${fs}px 'Space Mono', monospace`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = `rgba(${FGR},0.85)`;
      ctx.fillText(`[${L.id}]`, lx, ly);
      ctx.font = `${Math.max(9, Math.round(12*p.scale))}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},0.55)`;
      ctx.fillText(L.label, lx, ly+16*p.scale);
      ctx.fillText(`n=${L.count}`, lx, ly+32*p.scale);
    });
  } else {
    ctx.textBaseline = 'alphabetic';
    LAYERS.forEach((L) => {
      let top = L._nodes[0];
      for(const n of L._nodes) if(n.y0 < top.y0) top = n;
      const p = project(top.x0, top.y0 - 18, 0, time);
      const lx = p.sx, ly = p.sy;
      const fs = Math.max(11, Math.round(14 * p.scale));
      ctx.font = `${fs}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},0.85)`;
      ctx.fillText(`[${L.id}]`, lx, ly);
      ctx.font = `${Math.max(9, Math.round(12*p.scale))}px 'Space Mono', monospace`;
      ctx.fillStyle = `rgba(${FGR},0.55)`;
      ctx.fillText(L.label, lx, ly + 14*p.scale);
    });
  }

  ctx.restore();

  // Screen-space overlays — dashed connector from frozen anchor to panel
  if(panelOpen && frozenAnchor != null){
    const fn = nodes[frozenAnchor];
    const fnScreen = nodeScreenPos(fn);
    const sx = fnScreen.x;
    const sy = fnScreen.y;
    const panelEl = document.getElementById('panel');
    if(panelEl){
      const r = panelEl.getBoundingClientRect();
      let tx, ty;
      if(sx < r.left){       tx = r.left - 6;  ty = Math.max(r.top+24, Math.min(r.bottom-24, sy)); }
      else if(sx > r.right){ tx = r.right + 6; ty = Math.max(r.top+24, Math.min(r.bottom-24, sy)); }
      else if(sy < r.top){   tx = Math.max(r.left+24, Math.min(r.right-24, sx)); ty = r.top - 6; }
      else                  { tx = Math.max(r.left+24, Math.min(r.right-24, sx)); ty = r.bottom + 6; }
      ctx.save();
      ctx.strokeStyle = `rgba(${FGR},0.7)`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = FG;
      ctx.beginPath();
      ctx.arc(tx, ty, 2.2, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${FGR},0.9)`;
      ctx.beginPath();
      ctx.moveTo(sx-5, sy); ctx.lineTo(sx+5, sy);
      ctx.moveTo(sx, sy-5); ctx.lineTo(sx, sy+5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---- Event binding (called by main.js after data is loaded) ----
function bindNetworkEvents(){
  window.addEventListener('resize', resize);

  canvas.addEventListener('mousedown', (e) => {
    dragging  = true;
    dragStart = { x: e.clientX, y: e.clientY };
    viewStart = { x: view.x, y: view.y };
    canvas.classList.add('dragging');
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    canvas.classList.remove('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if(dragging){
      view.x = viewStart.x + (e.clientX - dragStart.x);
      view.y = viewStart.y + (e.clientY - dragStart.y);
      viewTarget.x = view.x; viewTarget.y = view.y; viewTweening = false;
    }
    // Hover detection — use projected screen positions so 3D rotation
    // is respected. Closer (larger-scale) nodes get a slightly bigger
    // hit threshold.
    let best = null, bestD = Infinity;
    for(const n of nodes){
      const np = nodeScreenPos(n);
      const d = Math.hypot(np.x - mouse.x, np.y - mouse.y);
      const threshold = Math.max(14, 22 * (n.scale || 1)) * view.k;
      if(d < threshold && d < bestD){ bestD = d; best = n; }
    }
    mouse.hoverNode = best;
    canvas.classList.toggle('linkhover', !!(best && (best.anchor || best.named || best.aside)));
    const tt = document.getElementById('tt');
    if(best){
      tt.style.display = 'block';
      tt.style.left = mouse.x + 'px';
      tt.style.top  = mouse.y + 'px';
      let label;
      if(best.anchor)      label = `${best.layerLabel} · NODE_${String(best.id).padStart(3,'0')} · ${best.anchor.name} ▸`;
      else if(best.named)  label = `${best.layerLabel} · NODE_${String(best.id).padStart(3,'0')} · ${best.named.label} ▸`;
      else if(best.aside)  label = `${best.layerLabel} · NODE_${String(best.id).padStart(3,'0')} · EPIGRAPH ▸`;
      else                 label = `${best.layerLabel} · NODE_${String(best.id).padStart(3,'0')}`;
      tt.textContent = label;
    } else {
      tt.style.display = 'none';
    }
  });

  canvas.addEventListener('click', () => {
    if(!mouse.hoverNode) return;
    const n = mouse.hoverNode;
    if(n.anchor) openPanel(n);
    else if(n.named){
      const parent = LAYERS[n.layer];
      const anchorNode = nodes.find(x => x.anchor && x.anchor.key === parent.anchor.key);
      if(anchorNode) openPanel(anchorNode, { focus: n.named.key });
    } else if(n.aside){
      openQuotePanel(n);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dz = Math.exp(-e.deltaY * 0.0015);
    const k1 = Math.max(0.45, Math.min(2.4, view.k * dz));
    // Zoom-around-mouse with the new viewport-centered transform.
    // screen.x = (W/2 + view.x) + (world.x - W/2) * k
    // We solve for view.x so the world point under the mouse stays put.
    const cxOff = mouse.x - W/2 - view.x;  // current (world.x - W/2) * k
    const cyOff = mouse.y - H/2 - view.y;
    const ratio = k1 / view.k;
    view.k = k1;
    view.x = mouse.x - W/2 - cxOff * ratio;
    view.y = mouse.y - H/2 - cyOff * ratio;
    viewTarget.x = view.x; viewTarget.y = view.y; viewTarget.k = view.k;
    viewTweening = false;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if(e.key === 'r' || e.key === 'R') tweenViewTo(0, 0, 1);
    if(e.key === 'Escape') closePanel();
  });
}
