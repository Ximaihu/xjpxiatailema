function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env }) {
  const voterId = getCookie(request, "voter_id");
  if (!voterId) {
    return new Response(JSON.stringify({ voted: false }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  const salt = env.VOTE_SALT || "change-me";
  const voterHash = await sha256Hex(`${salt}:${voterId}`);

  const row = await env.DB.prepare(
    "SELECT choice, created_at FROM votes WHERE voter_hash = ? LIMIT 1"
  ).bind(voterHash).first();

  return new Response(JSON.stringify({
    voted: Boolean(row),
    choice: row?.choice || null,
    created_at: row?.created_at || null
  }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}