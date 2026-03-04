export async function onRequestGet({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const day = new Date().toISOString().slice(0, 10);

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const vh = cookies.vh || "";
  const voter_hash = vh ? await sha256Hex(vh) : "";

  const db = env.DB;

  let byCookie = false;
  if (voter_hash) {
    const r = await db.prepare("SELECT 1 AS ok FROM votes WHERE voter_hash=? LIMIT 1").bind(voter_hash).first();
    byCookie = !!r?.ok;
  }

  const r2 = await db.prepare("SELECT 1 AS ok FROM vote_ip_day WHERE ip=? AND day=? LIMIT 1").bind(ip, day).first();
  const byIpDay = !!r2?.ok;

  return new Response(JSON.stringify({
    voted: byCookie || byIpDay,
    by: { cookie: byCookie, ip_day: byIpDay }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseCookies(cookieHeader) {
  const out = {};
  cookieHeader.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i === -1) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

async function sha256Hex(s) {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}