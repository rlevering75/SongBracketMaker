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

  // Client Credentials token — works for public playlists, no user login needed
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) {
    return Response.json({ error: 'Failed to authenticate with Spotify' }, { status: 500 });
  }

  const { access_token } = await tokenRes.json();

  // Fetch playlist metadata
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,tracks.total`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!metaRes.ok) {
    const msg = metaRes.status === 404
      ? "Playlist not found. Make sure it's public — private playlists require 'Connect with Spotify'."
      : `Spotify returned ${metaRes.status}`;
    return Response.json({ error: msg }, { status: metaRes.status });
  }

  const meta = await metaRes.json();

  // Fetch all tracks (paginated)
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,artists,album(images)))`;

  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!r.ok) return Response.json({ error: 'Failed to fetch tracks' }, { status: r.status });
    const data = await r.json();
    data.items.forEach(item => {
      if (item?.track?.id) {
        tracks.push({
          id:     item.track.id,
          name:   item.track.name,
          artist: item.track.artists.map(a => a.name).join(', '),
          art:    item.track.album?.images?.[0]?.url || null,
        });
      }
    });
    url = data.next;
  }

  return new Response(JSON.stringify({ name: meta.name, total: meta.tracks.total, tracks }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=300, stale-while-revalidate',
    },
  });
}
