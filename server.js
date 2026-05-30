// Local dev server — static files + /api/chat proxy to Groq.
// Run: node server.js
// Requires: GROQ_API_KEY in .env

try { require('dotenv').config(); } catch(_){}

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.md':   'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
};

async function proxyGroq(req, res) {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'GROQ_API_KEY not set. Add it to .env and restart.' } }));
    return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const { system = '', messages = [], max_tokens = 300 } = JSON.parse(body);
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
    });
    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const out  = data.error
      ? { error: { message: data.error.message } }
      : { content: [{ type: 'text', text }] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/api/chat' && req.method === 'POST') {
    proxyGroq(req, res);
    return;
  }

  let filePath = path.join(ROOT, pathname === '/' ? 'portfolio.html' : pathname);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  Neural Portfolio  →  http://localhost:${PORT}\n`);
  if (!process.env.GROQ_API_KEY)
    console.warn('  ⚠  GROQ_API_KEY not set — Kelex RAG will not work.\n     Add it to .env: GROQ_API_KEY=gsk_…\n');
});
