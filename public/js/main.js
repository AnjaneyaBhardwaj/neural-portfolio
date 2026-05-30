// ============================================================
// main.js — Boot glue. Waits for async data load, then wires up
// the network, panels, RAG index, and console. Owns the small
// HUD ticker (UTC clock + visited count).
// ============================================================

function tickClock(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('utc').textContent =
    `UTC ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  document.getElementById('date').textContent =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}

function updateHud(){
  const v = document.getElementById('visited');
  if(v) v.textContent = `${VISITED.size}/6`;
  const l = document.getElementById('last');
  if(l){
    if(!lastOpened) l.textContent = '—';
    else {
      const ago = Math.max(0, Math.floor(performance.now()/1000 - lastOpenedAt));
      l.textContent = `${lastOpened.toUpperCase()} · ${ago}s`;
    }
  }
}

(async function boot(){
  await dataReady;
  buildIndex();        // RAG index over the loaded docs
  buildGraph();        // build nodes + edges from LAYERS
  resize();            // computes layout
  bindNetworkEvents();
  bindPanelEvents();
  bindConsole();
  bindTour();
  applyTweaks();
  setInterval(tickClock, 500); tickClock();
  setInterval(updateHud, 1000); updateHud();
  requestAnimationFrame(frame);
  // On mobile, zoom out so the full network fits in the viewport.
  if(window.innerWidth < 720){
    const k = 0.8;
    view.k = k; viewTarget.k = k;
  }
  // Auto-launch the walkthrough on first visit. Brief delay so the
  // network has settled visually before the spotlight appears.
  setTimeout(() => startTour(), 900);
})();
