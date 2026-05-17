// Vercel serverless function: POST /api/imagine
// Multi-provider — set ONE of these env vars on Vercel (Settings → Environment Variables):
//   GROQ_API_KEY        ← free + fast (recommended). Get at https://console.groq.com
//   GEMINI_API_KEY      ← free, 1500 req/day. Get at https://aistudio.google.com/app/apikey
//   ANTHROPIC_API_KEY   ← paid. Claude.
//   OPENAI_API_KEY      ← paid. GPT-4o-mini.
// Priority order: GROQ → GEMINI → ANTHROPIC → OPENAI. First one found wins.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const prompt = (body && body.prompt) || '';
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'missing prompt' });
    return;
  }

  // Provider auto-detection
  const provider =
      process.env.GROQ_API_KEY      ? 'groq'
    : process.env.GEMINI_API_KEY    ? 'gemini'
    : process.env.ANTHROPIC_API_KEY ? 'anthropic'
    : process.env.OPENAI_API_KEY    ? 'openai'
    : null;

  if (!provider) {
    res.status(500).json({
      error: 'No API key configured',
      hint: 'Set GROQ_API_KEY (free) or GEMINI_API_KEY (free) or ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel env vars.'
    });
    return;
  }

  try {
    let text = '';
    if (provider === 'groq') {
      text = await callGroq(prompt);
    } else if (provider === 'gemini') {
      text = await callGemini(prompt);
    } else if (provider === 'anthropic') {
      text = await callAnthropic(prompt);
    } else if (provider === 'openai') {
      text = await callOpenAI(prompt);
    }
    res.status(200).json({ text, provider });
  } catch (err) {
    res.status(500).json({ error: 'provider call failed', provider, detail: String(err && err.message || err) });
  }
}

// —— Provider implementations ——

// Groq — OpenAI-compatible API, free tier is fast. Llama 3.1 70B is great for SVG.
async function callGroq(prompt) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 1024,
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

// Google Gemini — free tier (1500 req/day on Flash). REST API.
async function callGemini(prompt) {
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 1024 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('');
}

// Anthropic Claude — paid.
async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return Array.isArray(data.content)
    ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    : '';
}

// OpenAI — paid.
async function callOpenAI(prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 1024,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}
