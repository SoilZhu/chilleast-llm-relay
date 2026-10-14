var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders() }
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status, extra) {
  return jsonResponse({ error: { message, ...extra } }, status);
}
__name(errorResponse, "errorResponse");
async function isAuthorized(request, env) {
  const expected = (env.WORKER_API_KEY ?? "").trim();
  if (expected === "") return false;
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  if (match === null) return false;
  const provided = match[1].trim();
  if (provided === "") return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", a),
    crypto.subtle.digest("SHA-256", b)
  ]);
  return crypto.subtle.timingSafeEqual(new Uint8Array(ha), new Uint8Array(hb));
}
__name(isAuthorized, "isAuthorized");
function normalizeBaseUrl(raw) {
  let url = (raw ?? "").trim();
  if (url === "") url = "https://api.siliconflow.cn/v1";
  while (url.endsWith("/")) url = url.slice(0, -1);
  return url;
}
__name(normalizeBaseUrl, "normalizeBaseUrl");
function upstreamChatUrl(env) {
  return `${normalizeBaseUrl(env.UPSTREAM_BASE_URL)}/chat/completions`;
}
__name(upstreamChatUrl, "upstreamChatUrl");
async function handleChatCompletions(request, env) {
  if (!await isAuthorized(request, env)) {
    return errorResponse("Unauthorized: invalid or missing API key", 401);
  }
  const upstreamKey = (env.UPSTREAM_API_KEY ?? "").trim();
  if (upstreamKey === "") {
    return errorResponse("Relay misconfigured: UPSTREAM_API_KEY is not set", 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const forcedModel = (env.UPSTREAM_MODEL ?? "").trim();
  if (forcedModel !== "") {
    body["model"] = forcedModel;
  } else if (typeof body["model"] !== "string" || body["model"].trim() === "") {
    return errorResponse("Missing model in request body", 400);
  }
  let upstream;
  try {
    upstream = await fetch(upstreamChatUrl(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return errorResponse(`Upstream request failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
__name(handleChatCompletions, "handleChatCompletions");
async function handleModels(request, env) {
  if (!await isAuthorized(request, env)) {
    return errorResponse("Unauthorized: invalid or missing API key", 401);
  }
  const model = (env.UPSTREAM_MODEL ?? "").trim();
  const data = model !== "" ? [{ id: model, object: "model", owned_by: "worker-relay" }] : [{ id: "soilzhu-latest", object: "model", owned_by: "worker-relay" }];
  return jsonResponse({ object: "list", data });
}
__name(handleModels, "handleModels");
var index_default = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return jsonResponse({ status: "ok", service: "chilleast-ai-relay" });
      }
      if (request.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
        return handleModels(request, env);
      }
      if (request.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
        return handleChatCompletions(request, env);
      }
      return errorResponse(`Not found: ${request.method} ${url.pathname}`, 404);
    } catch (e) {
      return errorResponse(`Relay error: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
