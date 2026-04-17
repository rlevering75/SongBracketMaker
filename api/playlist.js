async function getToken(clientId, clientSecret) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('client_credentials token failed: ' + res.status);
  const { access_token } = await res.json();
  return access_token;
}

async function getWebPlayerToken() {
  const res = await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
      },
    }
  );
  if (!res.ok) throw new Error('web player token failed: ' + res.status);
  const data = await res.json();
  if (!data.accessToken) throw new Error('no accessToken in web player response');
  return data.accessToken;
}

async function fetchPlaylistWithToken(playlistId, access_token) {
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message || 'unknown'), { status: metaRes.status });
  }
  const meta = await metaRes.json();

  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Object.assign(new Error(body?.error?.message || 'unknown'), { status: r.status });
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

  return { name: meta.name, total: meta.tracks?.total ?? tracks.length, tracks };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return Response.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  const clientId     = process.env.SpotifyAPIID;
  const clientSecret = process.env.SpotifyAPISecret;

  const errors = [];

  // Attempt 1: Client Credentials
  if (clientId && clientSecret) {
    try {
      const token = await getToken(clientId, clientSecret);
      const result = await fetchPlaylistWithToken(playlistId, token);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=300, stale-while-revalidate' },
      });
    } catch (e) {
      errors.push('client_credentials: ' + e.message);
    }
  }

  // Attempt 2: Anonymous web player token
  try {
    const token = await getWebPlayerToken();
    const result = await fetchPlaylistWithToken(playlistId, token);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=60' },
    });
  } catch (e) {
    errors.push('web_player: ' + e.message);
  }

  return Response.json(
    { error: `Could not load playlist. All methods failed: ${errors.join(' | ')}` },
    { status: 403 }
  );
}
