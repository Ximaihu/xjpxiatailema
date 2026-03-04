export async function onRequest(context) {
  const { env } = context;
  try {
    const keep = await env.DB.prepare("SELECT COUNT(*) AS c FROM votes WHERE choice='keep'").first();
    const stepdown = await env.DB.prepare("SELECT COUNT(*) AS c FROM votes WHERE choice='stepdown'").first();
    const total = (Number(keep?.c || 0) + Number(stepdown?.c || 0));

    return new Response(JSON.stringify({
      ok: true,
      keep: Number(keep?.c || 0),
      stepdown: Number(stepdown?.c || 0),
      total
    }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}