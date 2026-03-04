export async function onRequest(context) {
  const { request, env } = context;
  try {
    const cookie = request.headers.get("Cookie") || "";
    const m = cookie.match(/(?:^|;\s*)vh=([^;]+)/);
    const voterHash = m ? decodeURIComponent(m[1]) : null;

    if (!voterHash) {
      return new Response(JSON.stringify({ ok: true, voted: false }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    const row = await env.DB.prepare("SELECT choice, created_at FROM votes WHERE voter_hash = ? LIMIT 1")
      .bind(voterHash)
      .first();

    return new Response(JSON.stringify({ ok: true, voted: !!row, choice: row?.choice || null, created_at: row?.created_at || null }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}