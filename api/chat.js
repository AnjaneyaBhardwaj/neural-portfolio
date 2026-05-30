// Vercel serverless function — proxies RAG queries to Groq.
// POST /api/chat  { system, messages, max_tokens }
// Returns         { content: [{ type:'text', text }] }  (Anthropic-shaped so rag.js needs no changes)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const key = process.env.GROQ_API_KEY || '';
  if (!key) {
    res.status(503).json({ error: { message: 'GROQ_API_KEY not set in environment variables.' } });
    return;
  }

  const { system = '', messages = [], max_tokens = 300 } = req.body || {};

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:      'llama-3.1-8b-instant',
      max_tokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
    }),
  });

  const data = await groqRes.json();

  if (data.error) {
    res.status(200).json({ error: { message: data.error.message || 'Groq error' } });
    return;
  }

  const text = data.choices?.[0]?.message?.content || '';
  res.status(200).json({ content: [{ type: 'text', text }] });
};
