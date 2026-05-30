// ============================================================
// tour.js — First-visit walkthrough. Spotlights key UI, narrates
// what each anchor / control does, and persists "seen" state so
// it only auto-launches once. Replay anytime via the bottom-right
// TOUR [?] launcher.
// ============================================================

const TOUR_STEPS = [
  {
    eyebrow: '// WALKTHROUGH · 01',
    title:   'Welcome to the network.',
    body:    'This is Anjaneya\'s portfolio rendered as a 7-layer neural network. Each column corresponds to a section of the resume. Take a quick walk-through — it lasts about a minute.',
    target:  null,
  },
  {
    eyebrow: '// ANCHORS',
    title:   'Click an anchor to open a section.',
    body:    'The six ringed circles — plus the Kelex sceptre at the far right — are <em>anchor nodes</em>. Click any one to open its full panel: Biography, Skills, Projects, CV, Contact, or Kelex.',
    target:  null,
  },
  {
    eyebrow: '// NAMED SUBNODES',
    title:   'Some smaller nodes are clickable too.',
    body:    'Inside the SKILLS and PROJECTS layers, smaller named nodes (PYTORCH, MARL_NIDS, …) are also entry points. Click one and the parent panel opens scrolled to that specific item, with the relevant connections highlighted in the network.',
    target:  null,
  },
  {
    eyebrow: '// CONSOLE',
    title:   'Four expressive tweaks live here.',
    body:    'The right-side CONSOLE reshapes the entire feel of the network. THEME flips dark / light. LAYOUT toggles geometry (linear · stack · radial). DEPTH adds 3D parallax — move your mouse to feel it. DENSITY changes edge volume. SERIF swaps the display typeface.',
    target:  '#tweaks',
    position: 'left',
    onEnter: () => {
      // Make sure the console is open so the spotlight has something to wrap.
      const tweaksEl   = document.getElementById('tweaks');
      const tweaksOpen = document.getElementById('tweaks-open');
      if(tweaksEl) tweaksEl.hidden = false;
      if(tweaksOpen) tweaksOpen.hidden = true;
    },
  },
  {
    eyebrow: '// KELEX',
    title:   'Ask the corpus.',
    body:    'Kelex is the sceptre at the far right of the network. It opens a live retrieval-augmented chat — it answers questions about Anjaneya by pulling from his biography, resume, and project notes. Try <em>"What did you build at Globant X?"</em>',
    target:  '#panel',
    position: 'left',
    onEnter: () => {
      // Open the Kelex inspector so the tour spotlights the actual panel.
      try {
        const ragNode = (typeof nodes !== 'undefined' && nodes.find)
          ? nodes.find(n => n.anchor && n.anchor.key === 'rag')
          : null;
        if(ragNode && typeof openPanel === 'function') openPanel(ragNode);
      } catch(_){}
    },
  },
  {
    eyebrow: '// READY',
    title:   'You\'re free to explore.',
    body:    'Drag to pan, scroll to zoom, <kbd>R</kbd> to reset the view, <kbd>Esc</kbd> to close a panel. The <strong>TOUR [?]</strong> at the bottom-right replays this walkthrough whenever you want.',
    target:  null,
    onEnter: () => {
      // Land the user on a clean network: close any open inspector panel
      // AND collapse the console so the view is unobstructed.
      try {
        if(typeof closePanel === 'function'
           && document.getElementById('overlay').classList.contains('open')){
          closePanel();
        }
      } catch(_){}
      try {
        const tweaksEl   = document.getElementById('tweaks');
        const tweaksOpen = document.getElementById('tweaks-open');
        if(tweaksEl)   tweaksEl.hidden = true;
        if(tweaksOpen) tweaksOpen.hidden = false;
        localStorage.setItem('np_console_open', '0');
      } catch(_){}
    },
  },
];

let tourIdx = 0;
let tourActive = false;

function setTourStep(i){
  tourIdx = i;
  const step = TOUR_STEPS[i];
  // Run any per-step setup BEFORE measuring DOM (e.g. expand the console).
  if(typeof step.onEnter === 'function'){
    try { step.onEnter(); } catch(_){}
  }
  document.getElementById('tour-eyebrow').textContent = step.eyebrow;
  document.getElementById('tour-title').textContent   = step.title;
  document.getElementById('tour-body').innerHTML      = step.body;
  document.getElementById('tour-progress').textContent =
    `${String(i+1).padStart(2,'0')} / ${String(TOUR_STEPS.length).padStart(2,'0')}`;
  document.getElementById('tour-back').disabled = i === 0;
  document.getElementById('tour-next').textContent =
    (i === TOUR_STEPS.length - 1) ? 'START EXPLORING →' : 'NEXT →';
  // Wait two frames so any onEnter-triggered layout settles (panel open
  // animation, console flip from hidden, etc.) before we measure for the
  // spotlight position.
  requestAnimationFrame(() => requestAnimationFrame(() => placeTourCard(step)));
}

function placeTourCard(step){
  const overlay   = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  const card      = document.getElementById('tour-card');
  const dimT = document.getElementById('tour-dim-top');
  const dimR = document.getElementById('tour-dim-right');
  const dimB = document.getElementById('tour-dim-bottom');
  const dimL = document.getElementById('tour-dim-left');

  const VW = window.innerWidth;
  const VH = window.innerHeight;
  const targetEl = step.target ? document.querySelector(step.target) : null;
  // Only honor a target if it's actually laid out (non-zero size).
  const rectRaw = targetEl ? targetEl.getBoundingClientRect() : null;
  const hasTarget = !!(rectRaw && rectRaw.width > 4 && rectRaw.height > 4);

  if(!hasTarget){
    overlay.classList.add('no-target');
    // Make the four dim rects cover the full viewport (top fills everything).
    dimT.style.cssText = `left:0;top:0;width:${VW}px;height:${VH}px;`;
    dimR.style.cssText = `display:none;`;
    dimB.style.cssText = `display:none;`;
    dimL.style.cssText = `display:none;`;
    // Center the card
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }

  overlay.classList.remove('no-target');
  const pad = 8;
  const sx = Math.max(0, rectRaw.left - pad);
  const sy = Math.max(0, rectRaw.top - pad);
  const sw = Math.min(VW, rectRaw.right  + pad) - sx;
  const sh = Math.min(VH, rectRaw.bottom + pad) - sy;

  // Spotlight ring
  spotlight.style.cssText = `left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;`;

  // Four surrounding dim rectangles
  dimT.style.cssText = `left:0;top:0;width:${VW}px;height:${sy}px;`;
  dimB.style.cssText = `left:0;top:${sy + sh}px;width:${VW}px;height:${Math.max(0, VH - (sy + sh))}px;`;
  dimL.style.cssText = `left:0;top:${sy}px;width:${sx}px;height:${sh}px;`;
  dimR.style.cssText = `left:${sx + sw}px;top:${sy}px;width:${Math.max(0, VW - (sx + sw))}px;height:${sh}px;`;

  // Place the card relative to the target.
  const cardW = card.offsetWidth || 380;
  const cardH = card.offsetHeight || 200;
  const gap = 24;
  const pos = step.position || 'right';
  let cx, cy;
  if(pos === 'left'){
    cx = rectRaw.left - cardW - gap;
    cy = rectRaw.top + rectRaw.height/2 - cardH/2;
  } else if(pos === 'right'){
    cx = rectRaw.right + gap;
    cy = rectRaw.top + rectRaw.height/2 - cardH/2;
  } else if(pos === 'top'){
    cx = rectRaw.left + rectRaw.width/2 - cardW/2;
    cy = rectRaw.top - cardH - gap;
  } else {
    cx = rectRaw.left + rectRaw.width/2 - cardW/2;
    cy = rectRaw.bottom + gap;
  }
  const margin = 16;
  cx = Math.max(margin, Math.min(VW - cardW - margin, cx));
  cy = Math.max(margin, Math.min(VH - cardH - margin, cy));
  card.style.left = cx + 'px';
  card.style.top  = cy + 'px';
  card.style.transform = 'none';
}

function startTour(opts){
  opts = opts || {};
  const force = opts.force === true;
  if(!force && localStorage.getItem('np_tour_seen') === '1') return;
  tourActive = true;
  document.getElementById('tour-overlay').hidden = false;
  // Re-place on resize so the spotlight tracks moving DOM elements
  window.addEventListener('resize', onTourResize);
  setTourStep(0);
}

function endTour(skipped){
  tourActive = false;
  document.getElementById('tour-overlay').hidden = true;
  document.getElementById('tour-overlay').classList.remove('no-target');
  window.removeEventListener('resize', onTourResize);
  // Close any panel the tour opened so the user lands on the network.
  try {
    if(typeof closePanel === 'function'
       && document.getElementById('overlay').classList.contains('open')){
      closePanel();
    }
  } catch(_){}
  try { localStorage.setItem('np_tour_seen', '1'); } catch(_){}
}

function onTourResize(){
  if(tourActive) placeTourCard(TOUR_STEPS[tourIdx]);
}

function bindTour(){
  document.getElementById('tour-next').addEventListener('click', () => {
    if(tourIdx < TOUR_STEPS.length - 1) setTourStep(tourIdx + 1);
    else endTour(false);
  });
  document.getElementById('tour-back').addEventListener('click', () => {
    if(tourIdx > 0) setTourStep(tourIdx - 1);
  });
  document.getElementById('tour-skip').addEventListener('click', () => endTour(true));
  document.getElementById('tour-launch').addEventListener('click', () => startTour({ force: true }));

  // Keyboard: arrows + Esc
  window.addEventListener('keydown', (e) => {
    if(!tourActive) return;
    if(e.key === 'ArrowRight' || e.key === 'Enter'){
      if(tourIdx < TOUR_STEPS.length - 1) setTourStep(tourIdx + 1);
      else endTour(false);
    } else if(e.key === 'ArrowLeft'){
      if(tourIdx > 0) setTourStep(tourIdx - 1);
    } else if(e.key === 'Escape'){
      endTour(true);
    }
  });
}
