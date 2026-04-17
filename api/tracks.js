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
  if (!data.accessToken) throw new Error('no accessToken in response');
  return data.accessToken;
}

async function fetchTracks(playlistId, access_token) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=US`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw Object.assign(new Error(body?.error?.message || String(r.status)), { status: r.status });
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
  return tracks;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId');
  const userToken  = searchParams.get('token');

  if (!playlistId) {
    return Response.json({ error: 'Missing playlistId' }, { status: 400 });
  }

  const errors = [];

  // Attempt 1: user's OAuth token
  if (userToken) {
    try {
      const tracks = await fetchTracks(playlistId, userToken);
      return Response.json({ tracks });
    } catch (e) {
      errors.push('user_token: ' + e.message);
    }
  }

  // Attempt 2: Client Credentials
  const clientId     = process.env.SpotifyAPIID;
  const clientSecret = process.env.SpotifyAPISecret;
  if (clientId && clientSecret) {
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        },
        body: 'grant_type=client_credentials',
      });
      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        const tracks = await fetchTracks(playlistId, access_token);
        return Response.json({ tracks });
      }
    } catch (e) {
      errors.push('client_credentials: ' + e.message);
    }
  }

  // Attempt 3: Anonymous web player token
  try {
    const token = await getWebPlayerToken();
    const tracks = await fetchTracks(playlistId, token);
    return Response.json({ tracks });
  } catch (e) {
    errors.push('web_player: ' + e.message);
  }

  return Response.json(
    { error: `All methods failed — ${errors.join(' | ')}. If this is a Spotify-generated playlist (Discover Weekly, Daily Mix, etc.) those cannot be accessed via the API. Try a playlist you created yourself.` },
    { status: 403 }
  );
}
