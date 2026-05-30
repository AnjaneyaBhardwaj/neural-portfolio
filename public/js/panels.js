// ============================================================
// panels.js — Inspector overlay panel. Open/close, header chrome,
// section renderers (bio, projects, skills, cv, contact, rag),
// quote/epigraph variant. Depends on config, data, network, rag.
// ============================================================

let overlay, panelBody, panelId, panelMeta, panelStamp;

function bindPanelEvents(){
  overlay    = document.getElementById('overlay');
  panelBody  = document.getElementById('panel-body');
  panelId    = document.getElementById('panel-id');
  panelMeta  = document.getElementById('panel-meta');
  panelStamp = document.getElementById('panel-stamp');
  document.getElementById('panel-close').addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) closePanel(); });
}

function markVisited(key){
  VISITED.add(key);
  localStorage.setItem('np_visited_v2', JSON.stringify([...VISITED]));
  updateHud();
}

function hexSig(seed){
  let s = seed * 9176311;
  const out = [];
  for(let i = 0; i < 2; i++){
    s = (s*1103515245 + 12345) >>> 0;
    out.push(s.toString(16).padStart(8, '0').slice(0, 4).toUpperCase());
  }
  return `0x${out[0]}·${out[1]}`;
}

function closePanel(){
  overlay.classList.remove('open');
  frozenAnchor = null;
  panelBody.innerHTML = '';
  tweenViewTo(0, 0, 1);
}

function openPanel(node, opts){
  opts = opts || {};
  frozenAnchor = node.id;
  const a = node.anchor;
  panelId.textContent   = ANCHOR_HEADER[a.key] || `[${node.layerLabel}] ${a.name}`;
  panelMeta.textContent = `NODE_${String(node.id).padStart(3,'0')} · LAYER ${node.layerLabel} · DEG_${edgesTouching(node.id)}`;
  panelStamp.textContent= `SIG: ${hexSig(node.id+1)}`;
  panelBody.innerHTML   = renderSection(a.key, opts);
  overlay.classList.add('open');

  markVisited(a.key);
  lastOpened = a.key;
  lastOpenedAt = performance.now()/1000;

  // Pan the network so the anchor stays visible after panel opens.
  if(W < 720){
    // Mobile: pan up so the anchor sits in the visible strip above the bottom sheet.
    const k = 0.8;
    const p = project(node.x0, node.y0, node.z0 || 0, 0);
    tweenViewTo(-(p.sx * k), H * 0.10 - H/2 - p.sy * k, k);
  } else if(W > 820){
    const rect = document.getElementById('panel').getBoundingClientRect();
    const targetScreenX = Math.max(80, rect.left - 90);
    const targetScreenY = H * 0.5;
    const k = 1.15;
    // .open class is already on overlay, so project() uses frozen yaw.
    const p = project(node.x0, node.y0, node.z0 || 0, 0);
    tweenViewTo(targetScreenX - W/2 - p.sx*k, targetScreenY - H/2 - p.sy*k, k);
  }

  if(a.key === 'rag') initRag();

  // Optional in-panel focus scroll (when arrived via a named-node click)
  if(opts.focus){
    requestAnimationFrame(() => {
      const el = panelBody.querySelector(`[data-focus="${opts.focus}"]`);
      if(el){
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('focus-flash');
        setTimeout(() => el.classList.remove('focus-flash'), 1800);
      }
    });
  }
}

function openQuotePanel(node){
  const spec = ASIDES[node.aside.layerKey];
  if(!spec) return;
  frozenAnchor = node.id;
  panelId.textContent   = `[${node.layerLabel}] EPIGRAPH · ${spec.title}`;
  panelMeta.textContent = `NODE_${String(node.id).padStart(3,'0')} · ${spec.id} · INTERSTITIAL`;
  panelStamp.textContent= `SIG: ${hexSig(node.id+1)}`;
  panelBody.innerHTML   = renderQuote(spec);
  overlay.classList.add('open');
  lastOpened = spec.id.toLowerCase();
  lastOpenedAt = performance.now()/1000;
  if(W < 720){
    const k = 0.8;
    const p = project(node.x0, node.y0, node.z0 || 0, 0);
    tweenViewTo(-(p.sx * k), H * 0.10 - H/2 - p.sy * k, k);
  } else if(W > 820){
    const rect = document.getElementById('panel').getBoundingClientRect();
    const targetScreenX = Math.max(80, rect.left - 90);
    const targetScreenY = H * 0.5;
    const k = 1.15;
    const p = project(node.x0, node.y0, node.z0 || 0, 0);
    tweenViewTo(targetScreenX - W/2 - p.sx*k, targetScreenY - H/2 - p.sy*k, k);
  }
}

function renderQuote(spec){
  return `
<div class="quote-wrap">
  <div class="label">// ${spec.id} · INTERSTITIAL_EPIGRAPH · ${spec.title}</div>
  <div class="quote-mark">“</div>
  <blockquote class="quote-body">${spec.quote}</blockquote>
  <div class="quote-attr">${spec.attribution}</div>
  <div class="rule"></div>
  <p style="opacity:.6;max-width:48ch;font-size:9px;letter-spacing:.18em;text-transform:uppercase">
    you reached this through a quiet plain node — not part of the main 6 sections. close the panel to return to the network.
  </p>
</div>`;
}

function renderSection(key, opts){
  opts = opts || {};
  if(key === 'bio')      return renderBio();
  if(key === 'projects') return renderProjects(opts);
  if(key === 'skills')   return renderSkills(opts);
  if(key === 'cv')       return renderCV();
  if(key === 'rag')      return renderRAG();
  if(key === 'contact')  return renderContact();
  return '';
}

function renderBio(){
  return `
<div class="grid-2" style="gap:48px">
  <div>
    <div class="label">// IDENTITY_VECTOR</div>
    <h1 class="h-serif lg it">Anjaneya Bhardwaj.<br/>AI/ML engineer.</h1>
    <p style="margin-top:14px;opacity:.85">Aspiring AI/ML engineer focused on Agentic AI, Reinforcement Learning, and Deep Learning. Currently pursuing an MS in Artificial Intelligence at the University at Buffalo. Building multi-agent systems, diffusion models, and graph-aware RL agents for high-stakes domains — healthcare, cybersecurity, industrial procurement.</p>
    <div class="rule"></div>
    <div class="label">// CORE_BELIEFS</div>
    <ul style="padding-left:18px;margin:6px 0">
      <li>Legible models outlive clever ones.</li>
      <li>Rigorous evaluation beats benchmark theatrics.</li>
      <li>The best AI systems are the ones whose failure modes you can explain in plain language.</li>
      <li>Multi-agent orchestration is software architecture, not prompt engineering.</li>
      <li><em>Focus on your duties, not the results.</em> — Bhagavad Gita</li>
    </ul>
    <div class="rule"></div>
    <div class="label">// CURRENTLY_READING · GETTING_INSPIRED_FROM</div>
    <ul style="padding-left:18px;margin:6px 0">
      <li><em>If you can keep your head when all about you<br/>Are losing theirs and blaming it on you,<br/>If you can trust yourself when all men doubt you,<br/>But make allowance for their doubting too;</em> — Rudyard Kipling, <em>If—</em></li>
    </ul>
  </div>
  <div>
    <div class="label">// LONG_FORM</div>
    <p style="opacity:.9">${BIO_TEXT.replace(/\. /g, '.<br/><br/>')}</p>
    <div class="rule"></div>
    <div class="grid-3" style="gap:12px">
      <div><div class="label">DEGREE</div><div class="h-serif it">MS AI</div></div>
      <div><div class="label">BASED</div><div class="h-serif it">Buffalo</div></div>
      <div><div class="label">FOCUS</div><div class="h-serif it">Agentic</div></div>
    </div>
  </div>
</div>`;
}

function renderProjects(){
  return `
<div class="label">// 06 PROJECTS · SORTED_BY_AFFECTION_DESC</div>
<h1 class="h-serif lg it">Things I have built<br/>and learned from.</h1>
<p style="opacity:.7;max-width:60ch;margin-top:6px">Each card lists the named <em>skill nodes</em> it consumes from <span style="border-bottom:1px solid #fff">[HIDDEN_02] SKILLS</span> — these are the dashed edges you see flowing into the network behind this panel.</p>
<div class="rule"></div>
<div class="grid-3">
  ${PROJECTS.map(p => {
    const linkedSkills = (PROJECT_SKILLS[p.key] || []).map(k => SKILL_LABEL[k]).filter(Boolean);
    return `
    <div class="proj" data-focus="${p.key}">
      <div class="pid">${p.id} · ${p.tag.toUpperCase()}</div>
      <h3>${p.name}</h3>
      <p>${p.body}</p>
      <div class="tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      ${linkedSkills.length
        ? `<div class="skill-trace">· LINKED_SKILLS → ${linkedSkills.join(' / ')}</div>`
        : `<div class="skill-trace dim">· no skill-node link</div>`}
    </div>`;
  }).join('')}
</div>
<div class="rule"></div>
<div class="ascii">
   layer_03 [PROJECTS] ← dashed edges ← layer_02 [SKILLS]
   the highlighted glyphs in the network reveal each project's skill basis.
</div>`;
}

function renderSkills(){
  return `
<div class="label">// SKILL_VECTOR · NORMALIZED [0..100]</div>
<h1 class="h-serif lg it">A weighted self-portrait.</h1>
<p style="opacity:.7;max-width:60ch">Self-reported magnitudes across the toolchain I actually reach for. Skills marked with <span style="border:1px solid #fff;padding:0 4px">◎</span> have a corresponding named node in the network and are wired to the projects that consume them.</p>
<div class="rule"></div>
${SKILL_GROUPS.map(g => `
  <div style="margin-bottom:22px">
    <div class="label">${g.head}</div>
    <div class="stack" style="gap:10px;margin-top:8px">
      ${g.items.map(item => {
        const [k, v, focus] = item;
        const focusAttr = focus ? ` data-focus="${focus}"` : '';
        const dot = focus ? '<span style="border:1px solid #fff;padding:0 4px;margin-left:8px;font-size:8px">◎</span>' : '';
        return `
        <div class="skill"${focusAttr}>
          <div>${k}${dot}</div>
          <div class="bar" style="--w:${v}%"></div>
          <div class="v">${String(v).padStart(2,'0')}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`).join('')}
`;
}

function renderCV(){
  return `
<div class="label">// CURRICULUM_VITAE · APPEND_ONLY_LOG</div>
<h1 class="h-serif lg it">A linear scan of the journey so far.</h1>
<div class="rule solid" style="opacity:1;margin-bottom:24px"></div>
${CV_ROWS.map(r => `
  <div class="cv-row">
    <div class="when">${r.when}</div>
    <div>
      <div class="role">${r.role}</div>
      <div class="org">${r.org}</div>
      <p>${r.body}</p>
    </div>
  </div>`).join('')}
<div class="rule"></div>
<div class="grid-3">
  <div><div class="label">CERTIFICATIONS</div><p>${CV_FOOTER.certifications}</p></div>
  <div><div class="label">LEADERSHIP</div><p>${CV_FOOTER.leadership}</p></div>
  <div><div class="label">AWARDS</div><p>${CV_FOOTER.awards}</p></div>
</div>`;
}

function renderContact(){
  const linkify = (k, v) => {
    if(k === 'EMAIL')    return `<a href="mailto:${v}" target="_blank">${v}</a>`;
    if(k === 'GITHUB')   return `<a href="https://${v}" target="_blank">${v}</a>`;
    if(k === 'LINKEDIN') return `<a href="https://${v}" target="_blank">${v}</a>`;
    return v;
  };
  const pair = (p) => `<div class="pair"><div class="k">${p.k}</div><div class="v">${linkify(p.k, p.v)}</div></div>`;
  return `
<div class="label">// OUTPUT_LAYER · ACTIVATION_THRESHOLD = LOW</div>
<h1 class="h-serif lg it">Send a signal.<br/>I usually respond within a day.</h1>
<div class="rule"></div>
<div class="contact-grid">
  <div class="stack">${CONTACT.left.map(pair).join('')}</div>
  <div class="stack">${CONTACT.right.map(pair).join('')}</div>
</div>
<div class="rule"></div>
<div class="ascii">
  ┌─[ END_OF_NETWORK ]──────────────────────────────────────┐
  │  thanks for traversing the graph.                       │
  │  − a.b.                                                 │
  └─────────────────────────────────────────────────────────┘
</div>`;
}
