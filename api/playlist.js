export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return Response.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  const clientId     = process.env.SpotifyAPIID;
  const clientSecret = process.env.SpotifyAPISecret;

  if (!clientId || !clientSecret) {
    return Response.json({ error: 'Spotify credentials not configured on server' }, { status: 500 });
  }

  // Client Credentials token
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) {
    const e = await tokenRes.json().catch(() => ({}));
    return Response.json({ error: 'Token failed: ' + (e.error_description || tokenRes.status) }, { status: 500 });
  }

  const { access_token } = await tokenRes.json();

  // Fetch playlist metadata — no fields filter, maximum compatibility
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({}));
    const msg = metaRes.status === 404
      ? "Playlist not found. Make sure it's set to Public in Spotify."
      : metaRes.status === 403
      ? `Playlist is private or restricted (Spotify 403). Open the playlist in Spotify → ··· menu → Share → set to Public, then try again. Raw: ${body?.error?.message || 'Forbidden'}`
      : `Spotify ${metaRes.status}: ${body?.error?.message || 'unknown error'}`;
    return Response.json({ error: msg }, { status: metaRes.status });
  }

  const meta = await metaRes.json();

  // Fetch all tracks (paginated) — no fields filter to avoid compatibility issues
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return Response.json(
        { error: `Tracks fetch failed — Spotify ${r.status}: ${body?.error?.message || 'unknown'}` },
        { status: r.status }
      );
    }
    const data = await r.json();
    (data.items || []).forEach(item => {
      if (item?.track?.id) {
        tracks.push({
          id:     item.track.id,
          name:   item.track.name,
          artist: (item.track.artists || []).map(a => a.name).join(', '),
          art:    item.track.album?.images?.[0]?.url || null,
        });
      }
    });
    url = data.next || null;
  }

  return new Response(JSON.stringify({ name: meta.name, total: meta.tracks?.total ?? tracks.length, tracks }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=300, stale-while-revalidate',
    },
  });
}
