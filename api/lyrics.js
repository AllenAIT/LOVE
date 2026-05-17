// POST /api/lyrics
// Body: { q: "song title artist" } OR { artist, track, duration }
// Returns: { found: bool, synced: string|null, plain: string|null, trackName, artistName, duration }
//
// Wraps lrclib.net free public API. Returns first match with synced lyrics if available,
// otherwise plain lyrics. Doesn't require auth.

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.status(405).json({ error: 'POST only' });
    return;
  }
  let body = req.body;
  if(typeof body === 'string'){ try { body = JSON.parse(body); } catch(_) { body = {}; } }
  body = body || {};

  try {
    let url, results;
    if(body.artist && body.track){
      // Exact match endpoint — best for known song
      const params = new URLSearchParams({
        artist_name: body.artist,
        track_name: body.track,
      });
      if(body.duration) params.set('duration', String(Math.round(body.duration)));
      url = `https://lrclib.net/api/get?${params}`;
      const r = await fetch(url, { headers: { 'user-agent': 'Inner Weather (https://github.com)' } });
      if(r.ok){
        const data = await r.json();
        return res.status(200).json({
          found: true,
          synced: data.syncedLyrics || null,
          plain: data.plainLyrics || null,
          trackName: data.trackName,
          artistName: data.artistName,
          duration: data.duration,
        });
      }
      // fall through to search
    }
    if(body.q){
      url = `https://lrclib.net/api/search?q=${encodeURIComponent(body.q)}`;
      const r = await fetch(url, { headers: { 'user-agent': 'Inner Weather (https://github.com)' } });
      if(!r.ok) throw new Error('lrclib search ' + r.status);
      results = await r.json();
      // pick best result: prefer synced
      const synced = results.find(x => x.syncedLyrics);
      const plain  = results.find(x => x.plainLyrics);
      const hit = synced || plain;
      if(!hit){
        return res.status(200).json({ found: false });
      }
      return res.status(200).json({
        found: true,
        synced: hit.syncedLyrics || null,
        plain: hit.plainLyrics || null,
        trackName: hit.trackName,
        artistName: hit.artistName,
        duration: hit.duration,
        alternates: results.slice(0, 5).map(r => ({
          trackName: r.trackName, artistName: r.artistName,
          duration: r.duration, hasSynced: !!r.syncedLyrics,
        })),
      });
    }
    res.status(400).json({ error: 'provide { q } or { artist, track }' });
  } catch(err){
    console.error('lyrics fetch error', err);
    res.status(500).json({ error: 'lrclib fetch failed', detail: String(err && err.message || err) });
  }
}
