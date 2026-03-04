function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const re = new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]+)");
  const m = cookie.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const choice = String(body?.choice || "").trim().toLowerCase();

    if (choice !== "keep" && choice !== "stepdown") {
      return new Response(JSON.stringify({ ok: false, error: "Invalid choice" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    let voterHash = getCookie(request, "vh");
    let setCookie = null;

    if (!voterHash) {
      voterHash = randomHex(16);
      setCookie = `vh=${encodeURIComponent(voterHash)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    }

    const insert = await env.DB.prepare("INSERT INTO votes (voter_hash, choice) VALUES (?, ?)")
      .bind(voterHash, choice)
      .run();

    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    if (setCookie) headers.set("Set-Cookie", setCookie);

    return new Response(JSON.stringify({ ok: true, voted: true, choice, inserted: !!insert?.success }), { headers });
  } catch (e) {
    const msg = String(e?.message || e);
    const isDup = /unique/i.test(msg) || /constraint/i.test(msg);

    if (isDup) {
      return new Response(JSON.stringify({ ok: true, voted: true, already: true }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}