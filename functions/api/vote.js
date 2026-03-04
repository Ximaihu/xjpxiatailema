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

/**
 * 可选：Turnstile 验证。你如果不想用，直接把这段函数删掉，并在下面不调用即可。
 */
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // 未配置则跳过
  if (!token) return false;

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const data = await resp.json();
  return Boolean(data && data.success);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const choice = String(body.choice || "").toLowerCase();
  if (choice !== "keep" && choice !== "stepdown") {
    return new Response(JSON.stringify({ ok: false, error: "bad_choice" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  // 可选：Turnstile（建议正式发布打开）
  const token = body.turnstileToken || null;
  const ip = request.headers.get("CF-Connecting-IP") || null;
  const pass = await verifyTurnstile(env, token, ip);
  if (!pass) {
    return new Response(JSON.stringify({ ok: false, error: "turnstile_failed" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const voterId = getCookie(request, "voter_id");
  if (!voterId) {
    return new Response(JSON.stringify({ ok: false, error: "no_voter_id" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const salt = env.VOTE_SALT || "change-me";
  const voterHash = await sha256Hex(`${salt}:${voterId}`);

  try {
    await env.DB.prepare(
      "INSERT INTO votes (voter_hash, choice) VALUES (?, ?)"
    ).bind(voterHash, choice).run();
  } catch (e) {
    // UNIQUE 冲突：已经投过
    return new Response(JSON.stringify({ ok: false, error: "already_voted" }), {
      status: 409,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}