// ============================================================
// console.js — In-page CONSOLE panel. Four expressive tweaks:
// THEME (dark/light), LAYOUT, DENSITY, SERIF. Persists to
// localStorage (and signals the host's edit-mode protocol so
// the toolbar toggle can also drive show/hide).
// ============================================================

function applyTweaks(){
  document.body.dataset.serif = TWEAKS.serif;
  document.body.dataset.theme = TWEAKS.theme;
  document.querySelectorAll('.tweak-radio').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.val === String(TWEAKS[key]));
    });
  });
}

function setTweak(k, v){
  if(TWEAKS[k] === v) return;
  TWEAKS[k] = v;
  if(k === 'density'){
    buildGraph();
    layout();
  } else if(k === 'layout' || k === 'depth'){
    layout();
    tweenViewTo(0, 0, 1);
  }
  applyTweaks();
  try { localStorage.setItem('np_tweaks', JSON.stringify(TWEAKS)); } catch(_){}
  try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*'); } catch(_){}
}

function bindConsole(){
  document.querySelectorAll('.tweak-radio').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => setTweak(key, btn.dataset.val));
    });
  });

  const tweaksEl   = document.getElementById('tweaks');
  const tweaksOpen = document.getElementById('tweaks-open');

  function showConsole(show){
    tweaksEl.hidden   = !show;
    tweaksOpen.hidden = show;
    try { localStorage.setItem('np_console_open', show ? '1' : '0'); } catch(_){}
  }
  const savedOpen = localStorage.getItem('np_console_open');
  showConsole(savedOpen === null ? true : savedOpen === '1');

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if(d.type === '__activate_edit_mode')   showConsole(true);
    if(d.type === '__deactivate_edit_mode') showConsole(false);
  });
  document.getElementById('tweaks-close').addEventListener('click', () => {
    showConsole(false);
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch(_){}
  });
  tweaksOpen.addEventListener('click', () => showConsole(true));

  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch(_){}
}
