import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
  ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appOrigin = Deno.env.get("SINAG_APP_ORIGIN") ?? "";
const rateLimitPepper = Deno.env.get("SINAG_RATE_LIMIT_PEPPER") ?? "";
const participantIdPattern = /^TSI-P\d{6,}$/;
const genericMessage = "If your TSI ID and signup details can be registered, your account is ready. Sign in with the email and password you chose.";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === appOrigin ? appOrigin : "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const respond = (origin: string | null, status = 202, message = genericMessage) =>
  new Response(JSON.stringify({ message }), {
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appOrigin || !rateLimitPepper) {
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

  const { data, error } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appOrigin}/login`,
      data: {
        first_name: participant.first_name,
        last_name: participant.surname,
      },
    },
  });

  if (error || !data.user) {
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }

  // Supabase Auth can return an obfuscated user for an existing email. Do not
  // bind participant metadata unless this request created an Auth identity.
  if (!data.user.identities?.length) return respond(origin);

  // This project deliberately uses an issued TSI ID as the signup eligibility
  // check instead of email confirmation. Require Supabase Auth auto-confirm.
  if (!data.session || !data.user.email_confirmed_at) {
    await admin.auth.admin.deleteUser(data.user.id);
    return respond(origin, 503, "Supabase Auth auto-confirm is not configured. Contact the SINAG administrator.");
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

  return respond(origin);
  } catch {
    // Do not log request data: the body contains a password.
    return respond(origin, 503, "Signup is temporarily unavailable. Please try again later.");
  }
});
