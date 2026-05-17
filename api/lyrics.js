// POST /api/lyrics
// Body: { q: "song title artist" } OR { artist, track, duration }
// Returns: { found: bool, synced: string|null, plain: string|null, trackName, artistName, duration }
//
// Wraps lrclib.net free public API. Returns first match with synced lyrics if available,
// otherwise plain lyrics. Doesn't require auth.

function buildResponse(results){
  const synced = results.find(x => x.syncedLyrics);
  const plain  = results.find(x => x.plainLyrics);
  const hit = synced || plain;
  if(!hit) return { found: false };
  return {
    found: true,
    synced: hit.syncedLyrics || null,
    plain: hit.plainLyrics || null,
    trackName: hit.trackName,
    artistName: hit.artistName,
    duration: hit.duration,
    alternates: results.slice(0, 8).map(r => ({
      trackName: r.trackName, artistName: r.artistName,
      duration: r.duration, hasSynced: !!r.syncedLyrics,
    })),
  };
}

async function searchAlternates({ track, artist }){
  try {
    const params = new URLSearchParams();
    if(track) params.set('track_name', track);
    if(artist) params.set('artist_name', artist);
    const r = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { 'user-agent': 'Inner Weather (https://github.com)' },
    });
    if(!r.ok) return [];
    const arr = await r.json();
    if(!Array.isArray(arr)) return [];
    return arr.slice(0, 8).map(x => ({
      trackName: x.trackName, artistName: x.artistName,
      duration: x.duration, hasSynced: !!x.syncedLyrics,
    }));
  } catch(_){ return []; }
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.status(405).json({ error: 'POST only' });
    return;
  }
  let body = req.body;
  if(typeof body === 'string'){ try { body = JSON.parse(body); } catch(_) { body = {}; } }
  body = body || {};

  try {
    // Parse "Title — Artist" out of a free-text q so we can search title-specifically.
    let track = body.track, artist = body.artist;
    if(!track && body.q){
      const m = String(body.q).match(/^(.+?)\s*[-—–]\s*(.+)$/);
      if(m){ track = m[1].trim(); artist = m[2].trim(); }
      else { track = String(body.q).trim(); }
    }

    // 1) If we have both artist + track, try /api/get for an exact hit first
    if(artist && track){
      const params = new URLSearchParams({ artist_name: artist, track_name: track });
      if(body.duration) params.set('duration', String(Math.round(body.duration)));
      const r = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: { 'user-agent': 'Inner Weather (https://github.com)' },
      });
      if(r.ok){
        const data = await r.json();
        // Still do a search to populate alternates in case the user wants to override
        const alts = await searchAlternates({ track, artist });
        return res.status(200).json({
          found: true,
          synced: data.syncedLyrics || null,
          plain: data.plainLyrics || null,
          trackName: data.trackName,
          artistName: data.artistName,
          duration: data.duration,
          alternates: alts,
        });
      }
      // fall through to search
    }

    // 2) Search BY TITLE (track_name) — avoids "fuzzy in lyrics content" false matches
    if(track){
      const params = new URLSearchParams({ track_name: track });
      if(artist) params.set('artist_name', artist);
      const r = await fetch(`https://lrclib.net/api/search?${params}`, {
        headers: { 'user-agent': 'Inner Weather (https://github.com)' },
      });
      if(!r.ok) throw new Error('lrclib search ' + r.status);
      const results = await r.json();
      if(!Array.isArray(results) || !results.length){
        // Fall back to fuzzy q search as last resort
        const r2 = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(body.q || track)}`, {
          headers: { 'user-agent': 'Inner Weather (https://github.com)' },
        });
        if(r2.ok){
          const fuzzy = await r2.json();
          if(Array.isArray(fuzzy) && fuzzy.length){
            return res.status(200).json(buildResponse(fuzzy));
          }
        }
        return res.status(200).json({ found: false });
      }
      return res.status(200).json(buildResponse(results));
    }

    res.status(400).json({ error: 'provide { q } or { artist, track }' });
  } catch(err){
    console.error('lyrics fetch error', err);
    res.status(500).json({ error: 'lrclib fetch failed', detail: String(err && err.message || err) });
  }
}
