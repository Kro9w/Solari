import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appOrigin = Deno.env.get("SINAG_APP_ORIGIN") ?? "";
const rateLimitPepper = Deno.env.get("SINAG_RATE_LIMIT_PEPPER") ?? "";
// Keep previously issued numeric IDs valid alongside the new random suffix.
const participantIdPattern = /^TSI-[PV](?:\d{6,}|\d{2}[A-Z0-9]{4})$/;
const genericMessage = "If your TSI ID and signup details can be registered, your account is ready. Sign in with the email and password you chose.";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === appOrigin ? appOrigin : "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const respond = (origin: string | null, status = 202, message = genericMessage, success = false) =>
  new Response(JSON.stringify({ message, success }), {
    status,
    headers: { ...headersFor(origin), "Content-Type": "application/json" },
  });

async function hashBucket(scope: string, value: string) {
  const bytes = new TextEncoder().encode(`${rateLimitPepper}:${scope}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeLimit(scope: string, value: string, maxAttempts: number) {
  const bucketHash = await hashBucket(scope, value);
  const { data, error } = await admin.rpc("consume_sinag_signup_rate_limit", {
    p_bucket_hash: bucketHash,
    p_max_attempts: maxAttempts,
    p_window_seconds: 3600,
  });
  return { allowed: !error && data === true, failed: !!error };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  try {
  if (!supabaseUrl || !serviceRoleKey || !appOrigin || !rateLimitPepper) {
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }
  if (origin !== appOrigin) return respond(origin, 403, "Request not allowed.");
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (request.method !== "POST") return respond(origin, 405);

  let body: { email?: unknown; password?: unknown; participantId?: unknown };
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 4096) return respond(origin, 413);
    body = await request.json();
  } catch {
    return respond(origin, 202);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const participantId = typeof body.participantId === "string"
    ? body.participantId.trim().toUpperCase()
    : "";
  const remoteIp = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";

  const ipLimit = await consumeLimit("ip", remoteIp, 12);
  if (ipLimit.failed) return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  if (!ipLimit.allowed) return respond(origin, 429, "Signup is temporarily unavailable. Please try again later.");

  const idLimit = await consumeLimit("participant", participantId || "missing", 5);
  if (idLimit.failed) return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  if (!idLimit.allowed) return respond(origin, 429, "Signup is temporarily unavailable. Please try again later.");

  if (!participantIdPattern.test(participantId) || !email || !password) {
    return respond(origin);
  }

  // The deployed contract grants service_role SELECT on participant rows.
  // No participant data or Auth email is ever returned to the browser.
  const { data: participant, error: participantError } = await admin
    .from("sinag_participants")
    .select("participant_id, first_name, surname, auth_user_id")
    .eq("participant_id", participantId)
    .maybeSingle();

  if (participantError) {
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }
  if (!participant || participant.auth_user_id !== null) return respond(origin);

  // Create and confirm the Auth user in this trusted server-side function.
  // This makes issued TSI ID eligibility the onboarding check and does not
  // depend on the public sign-up endpoint's email-confirmation settings.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: participant.first_name,
      last_name: participant.surname,
    },
  });

  if (error || !data.user) {
    return respond(origin);
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      ...data.user.app_metadata,
      sinag_participant_id: participantId,
    },
  });

  if (metadataError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }

  return respond(origin, 202, genericMessage, true);
  } catch {
    // Do not log request data: the body contains a password.
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }
});
