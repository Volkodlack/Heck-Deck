// HEX DECK — Supabase Edge Function : identifiants TURN Cloudflare de courte durée.
// Le secret Cloudflare reste côté serveur ; le client reçoit seulement des iceServers temporaires.
//
// Déploiement :
//   supabase secrets set CF_TURN_KEY_ID=... CF_TURN_KEY_API_TOKEN=...
//   supabase functions deploy turn-credentials
const KEY_ID = Deno.env.get('CF_TURN_KEY_ID');
const TOKEN = Deno.env.get('CF_TURN_KEY_API_TOKEN');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!KEY_ID || !TOKEN) return Response.json({ error: 'TURN non configuré' }, { status: 501, headers: cors });
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 4 * 3600 }), // une soirée de jeu
  });
  if (!r.ok) return Response.json({ error: `Cloudflare ${r.status}` }, { status: 502, headers: cors });
  const { iceServers } = await r.json();
  return Response.json({ iceServers }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
});
