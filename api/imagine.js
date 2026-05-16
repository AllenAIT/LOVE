// Vercel serverless function: POST /api/imagine
// Set the env var ANTHROPIC_API_KEY on your Vercel project (Settings → Environment Variables).
// The HTML client falls back to this endpoint when window.claude isn't available.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on the server' });
    return;
  }

  // Body parsing: Vercel parses JSON automatically when content-type is application/json,
  // but be defensive in case it didn't.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const prompt = (body && body.prompt) || '';
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'missing prompt' });
    return;
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      const errTxt = await r.text();
      res.status(r.status).json({ error: 'Anthropic API error', detail: errTxt });
      return;
    }
    const data = await r.json();
    // Concatenate text blocks — the model usually returns a single text block.
    const text = (data && Array.isArray(data.content))
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      : '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: 'fetch failed', detail: String(err) });
  }
}
