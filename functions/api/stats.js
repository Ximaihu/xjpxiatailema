export async function onRequestGet({ env }) {
  const keepRow = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM votes WHERE choice = ?"
  ).bind("keep").first();

  const stepRow = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM votes WHERE choice = ?"
  ).bind("stepdown").first();

  const keep = Number(keepRow?.c || 0);
  const stepdown = Number(stepRow?.c || 0);
  const total = keep + stepdown;

  return new Response(JSON.stringify({ keep, stepdown, total }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}