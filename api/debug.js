export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId') || '37i9dQZEVXbMDoHDwVN2tF'; // Top 50 Global as default

  const clientId     = process.env.SpotifyAPIID;
  const clientSecret = process.env.SpotifyAPISecret;

  const result = {
    hasClientId:     !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdPrefix:  clientId ? clientId.slice(0, 6) + '…' : null,
  };

  // Step 1: get a Client Credentials token
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  });

  const tokenBody = await tokenRes.json();
  result.tokenStatus = tokenRes.status;
  result.tokenError  = tokenBody.error || null;

  if (!tokenRes.ok) {
    return Response.json(result);
  }

  const access_token = tokenBody.access_token;
  result.gotToken = true;

  // Step 2: fetch the playlist metadata
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,tracks.total`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const metaBody = await metaRes.json();
  result.playlistStatus = metaRes.status;
  result.playlistError  = metaBody.error || null;
  result.playlistName   = metaBody.name   || null;

  return Response.json(result);
}
