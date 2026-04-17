// Client ID is safe to expose publicly — it's not secret for PKCE flows
export function GET() {
  return Response.json({ clientId: process.env.SpotifyAPIID || '' });
}
