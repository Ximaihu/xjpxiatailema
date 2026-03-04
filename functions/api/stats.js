export async function onRequestGet({ env }) {
  const db = env.DB;

  const keep = await db.prepare("SELECT COUNT(*) AS c FROM votes WHERE choice='keep'").first();
  const stepdown = await db.prepare("SELECT COUNT(*) AS c FROM votes WHERE choice='stepdown'").first();
  const total = (keep?.c || 0) + (stepdown?.c || 0);

  return new Response(JSON.stringify({
    keep: keep?.c || 0,
    stepdown: stepdown?.c || 0,
    total
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}