export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    // 可选：Bot 分数（没有 botManagement 就跳过）
    const score = request.cf?.botManagement?.score;
    if (typeof score === "number" && score < 30) {
      return json({ ok: false, error: "bot_blocked" }, 403);
    }

    const body = await safeJson(request);
    const choice = String(body?.choice || "").toLowerCase(); // keep / stepdown
    const token = String(body?.token || "");

    if (!["keep", "stepdown"].includes(choice)) {
      return json({ ok: false, error: "bad_choice" }, 400);
    }
    if (!token) {
      return json({ ok: false, error: "missing_turnstile" }, 400);
    }

    // Turnstile 校验
    const turnOK = await verifyTurnstile(token, env.TURNSTILE_SECRET, ip);
    if (!turnOK) {
      return json({ ok: false, error: "turnstile_failed" }, 403);
    }

    // 生成/读取 cookie（浏览器唯一）
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    let vh = cookies.vh;
    if (!vh) vh = crypto.randomUUID();

    const voter_hash = await sha256Hex(vh);

    // 今天（UTC）
    const day = new Date().toISOString().slice(0, 10);

    // 1) 每 IP 每天一次（靠 vote_ip_day 的 UNIQUE(ip, day)）
    // 2) 每浏览器一次（靠 votes 的 UNIQUE(voter_hash)）
    // 两个都通过才写票
    const db = env.DB;

    // 先锁 IP/day
    // 如果重复，会抛 UNIQUE 约束错误
    await db
      .prepare("INSERT INTO vote_ip_day (ip, day) VALUES (?, ?)")
      .bind(ip, day)
      .run();

    // 再写票
    await db
      .prepare("INSERT INTO votes (voter_hash, choice) VALUES (?, ?)")
      .bind(voter_hash, choice)
      .run();

    const headers = {
      "Set-Cookie": buildCookie("vh", vh),
      "Cache-Control": "no-store",
    };
    return json({ ok: true }, 200, headers);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);

    // UNIQUE 约束：说明投过了（IP/day 或 voter_hash 任意一个重复）
    if (msg.includes("UNIQUE constraint failed")) {
      return json({ ok: false, error: "already_voted" }, 409);
    }

    return json({ ok: false, error: "server_error", detail: msg }, 500);
  }
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function safeJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return await request.json();
  // 兼容 form
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await request.formData();
    return Object.fromEntries(fd.entries());
  }
  return {};
}

async function verifyTurnstile(token, secret, ip) {
  if (!secret) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);

  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  const data = await r.json().catch(() => ({}));
  return data.success === true;
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

function buildCookie(name, value) {
  // 180 天
  const maxAge = 180 * 24 * 60 * 60;
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Lax`;
}

async function sha256Hex(s) {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}