// ============================================================
// rag.js — Client-side RAG pipeline. Chunks the 3 docs into
// 100-word windows w/ 25-word overlap, builds TF vectors,
// retrieves top-3 by cosine similarity, injects into Claude.
// Also fires node-activation pulses in the RAG layer of the
// network so retrieval is visible behind the panel.
// ============================================================

const STOP = new Set(
  ('a an and the of in on for to at from by with is are was were be been being it its ' +
   'this that those these as or but if then so do does did i you he she they we us them ' +
   'my your our their not no into about over under more most less than')
  .split(/\s+/)
);

let CHUNKS = [];
let CHUNK_VECS = [];

function tokenize(s){
  return s.toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t) && t.length > 1);
}

function chunkDoc(name, text, size = 100, overlap = 25){
  const words = text.split(/\s+/);
  const out = [];
  let i = 0, idx = 0;
  while(i < words.length){
    const slice = words.slice(i, i + size).join(' ');
    out.push({ id: `${name}#${String(idx).padStart(2,'0')}`, doc: name, text: slice });
    idx++;
    i += (size - overlap);
    if(i + overlap >= words.length && i + size > words.length) break;
  }
  return out;
}

function tf(tokens){
  const m = new Map();
  for(const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  let norm = 0; for(const v of m.values()) norm += v*v;
  norm = Math.sqrt(norm) || 1;
  for(const [k, v] of m) m.set(k, v/norm);
  return m;
}

function cosine(a, b){
  let s = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for(const [k, v] of small){
    const w = big.get(k);
    if(w) s += v * w;
  }
  return s;
}

function buildIndex(){
  CHUNKS = [
    ...chunkDoc('BIOGRAPHY', BIO_TEXT),
    ...chunkDoc('RESUME',    RESUME_TEXT),
    ...chunkDoc('PROJECTS',  PROJECTS_TEXT),
  ];
  CHUNK_VECS = CHUNKS.map(c => tf(tokenize(c.text)));
}

function retrieve(query, k = 3){
  const qv = tf(tokenize(query));
  const scored = CHUNK_VECS.map((v, i) => ({ i, s: cosine(qv, v) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map(x => ({ ...CHUNKS[x.i], score: x.s }));
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderRAG(){
  return `
<div class="rag">
  <div class="left">
    <div class="label">// KELEX · CLIENT_SIDE_PIPELINE</div>
    <h1 class="h-serif it" style="font-size:22px;margin-bottom:6px">Ask Kelex.</h1>
    <p style="opacity:.75;max-width:55ch">Kelex is a live retrieval-augmented chat over three documents — Biography, Resume, Projects — chunked into 100-word windows with 25-word overlap, retrieved by TF cosine similarity (k=3), and injected as context into <span style="border-bottom:1px solid #fff">llama-3.1-8b-instant</span> via Groq. The retrieval log on the right shows which chunks fired and at what score.</p>
    <div class="rule"></div>
    <div id="rag-chat" class="chat">
      <div class="msg">
        <div class="who">SYSTEM</div>
        <div class="text">Index built. ${CHUNKS.length} chunks across 3 documents. Try: <em>“What did you build at Globant?”</em>, <em>“Tell me about your diffusion-model project”</em>, <em>“Where did you go to school?”</em></div>
      </div>
    </div>
    <form id="rag-form" class="form" autocomplete="off">
      <input id="rag-input" type="text" placeholder="ASK KELEX ANYTHING…" />
      <button id="rag-btn" type="submit">QUERY →</button>
    </form>
  </div>
  <div class="right" id="rag-retr"></div>
</div>`;
}

function initRag(){
  const ragChat = document.getElementById('rag-chat');
  const ragRetr = document.getElementById('rag-retr');
  const form    = document.getElementById('rag-form');
  const input   = document.getElementById('rag-input');
  const btn     = document.getElementById('rag-btn');

  function appendMsg(who, text, opts = {}){
    const div = document.createElement('div');
    div.className = 'msg' + (who === 'YOU' ? ' user' : '');
    div.innerHTML = `<div class="who">${who}</div><div class="text${opts.serif?' serif':''}">${text}</div>`;
    ragChat.appendChild(div);
    ragChat.scrollTop = ragChat.scrollHeight;
    return div;
  }

  function setRetr(items, query){
    ragRetr.innerHTML = `
      <div class="retr-head"><span>// RETRIEVAL_LOG</span><span>k=3 · cosine_tf</span></div>
      ${items.map((c, i) => `
        <div class="retr">
          <div class="top"><span>RANK_${String(i+1).padStart(2,'0')} · ${c.id}</span><span>SIM ${c.score.toFixed(4)}</span></div>
          <div class="snippet">${escapeHtml(c.text.slice(0, 220))}…</div>
        </div>`).join('')}
      <div class="stats">
        <div class="b"><span class="label" style="margin:0;opacity:.6">CHUNKS</span><span class="n">${CHUNKS.length}</span></div>
        <div class="b"><span class="label" style="margin:0;opacity:.6">DIMS</span><span class="n">${new Set(CHUNK_VECS.flatMap(v => [...v.keys()])).size}</span></div>
        <div class="b"><span class="label" style="margin:0;opacity:.6">QUERY_LEN</span><span class="n">${tokenize(query || '').length}</span></div>
      </div>`;
  }
  setRetr([], '');

  if(!form.dataset.bound){
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if(!q) return;
      input.value = '';
      appendMsg('YOU [QUERY]', escapeHtml(q));
      const top = retrieve(q, 3);
      setRetr(top, q);

      // Light up the network: map retrieved chunks onto RAG-layer nodes
      const ragNodes = window.__RAG_LAYER_NODES || [];
      if(ragNodes.length){
        const now = performance.now()/1000;
        top.forEach((c, rank) => {
          const chunkIdx = CHUNKS.indexOf(CHUNKS.find(x => x.id === c.id));
          const idx = ((chunkIdx >= 0 ? chunkIdx : rank)*3 + rank) % ragNodes.length;
          const node = ragNodes[idx];
          ragActive.push({ nodeId: node.id, until: now + 4.5 - rank*0.5 });
        });
      }

      const placeholder = appendMsg('KELEX', '<span class="blink">▮</span> retrieving · injecting context · streaming…');
      btn.disabled = true;
      try {
        const ctx = top.map(c => `[${c.id} · sim=${c.score.toFixed(3)}]\n${c.text}`).join('\n\n---\n\n');
        const system = `You are answering questions about Anjaneya Bhardwaj based ONLY on the retrieved context below. If the context does not contain the answer, say so plainly. Speak in Anjaneya's voice — direct, precise, low-ego. Keep responses under 120 words. Format as plain prose, not bullet points.\n\nRETRIEVED_CONTEXT:\n${ctx}`;
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 300,
            system,
            messages: [{ role: 'user', content: q }],
          }),
        });
        const json = await res.json();
        const reply = json.content?.[0]?.text || json.error?.message || '(no response)';
        placeholder.querySelector('.text').innerHTML = escapeHtml(reply).replace(/\n/g, '<br/>');
      } catch(err){
        placeholder.querySelector('.text').textContent = 'ERROR: ' + (err && err.message || err);
      } finally {
        btn.disabled = false;
        input.focus();
      }
    });
  }
}
