export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId');
  const userToken  = searchParams.get('token');

  if (!playlistId) {
    return Response.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  // Use user's OAuth token if provided, otherwise fall back to Client Credentials
  let access_token = userToken;

  if (!access_token) {
    const clientId     = process.env.SpotifyAPIID;
    const clientSecret = process.env.SpotifyAPISecret;
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'No token and no server credentials configured' }, { status: 500 });
    }
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) {
      return Response.json({ error: 'Token fetch failed' }, { status: 500 });
    }
    ({ access_token } = await tokenRes.json());
  }

  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return Response.json(
        { error: `Spotify ${r.status}: ${body?.error?.message || 'unknown'}` },
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

  return Response.json({ tracks });
}
