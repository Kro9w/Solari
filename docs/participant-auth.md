# SINAG participant signup and authentication

## Current application flow

- Signup uses Supabase Auth email/password signup and sends the member to the
  configured email verification redirect. The member chooses their password;
  the client creates no temporary password.
- Signup collects the issued TSI ID and keeps it in the current browser tab's
  `sessionStorage` only to prefill onboarding after verification. If the member
  returns in a different browser or tab, they can enter the ID again.
- After email verification and email/password sign-in, `/onboarding` calls the
  existing `link_sinag_participant(p_participant_id)` RPC. It does not query
  participant rows from the browser. Unissued, unavailable, or already-claimed
  IDs receive the same generic link error. The client validates the deployed ID
  shape (`TSI-P` plus six or more digits) before sending it to the RPC.
- Protected app and exam routes check `is_sinag_participant_linked()` and
  require a verified Auth session. Exam sessions and results continue to use
  their existing Auth UUIDs.
- Login currently supports Email. TSI ID is shown as unavailable until the
  secure server-side authentication endpoint below is deployed. The browser
  never resolves a participant ID to an email.

## Schema and RPC inspection

The deployed contract supplied for this work defines `sinag_participants` with
unique `participant_id`, unique `discord_user_id bigint`, and optional unique
`auth_user_id uuid`, plus RLS/grants that prevent public table access. It
defines `issue_sinag_participant_id(bigint,text,text)` for service-side ID
issuance. The repository has calls to `link_sinag_participant` and
`is_sinag_participant_linked`, but their SQL definitions are not checked into
this checkout and the deployment database is not connected here. Before
release, verify the deployed linking RPCs require verified `auth.uid()`, only
link an unclaimed participant row (or safely retry the same link), enforce the
unique Auth-to-participant relationship, and reveal no participant data.

No participant schema changes or `allowed_surnames` retirement are included in
this UI work.

## TSI ID login backend requirement

The current Supabase browser SDK password flow accepts an email or phone, not
an arbitrary TSI ID. Do not enable the disabled TSI ID option until a trusted
server-side function can authenticate the supplied ID and password. A suitable
Supabase Edge Function should:

1. Accept a TSI ID and password over HTTPS, validate the ID shape, and apply
   generic errors for invalid, unissued, unlinked, unverified, or incorrect
   credentials.
2. Resolve only a linked participant ID on the server using the service-role
   key, retrieve its Auth user internally, and never return/log that user's
   email or any password/token.
3. Complete Supabase Auth password sign-in internally using the Supabase Auth
   password grant and the public/anon key, returning only the resulting Auth
   session to the caller. The service-role key and resolved email remain in
   server memory and server-only secrets.
4. Enforce per-IP and per-ID rate limits at the function/API gateway (and use
   Supabase Auth's own rate limits); configure CAPTCHA or equivalent abuse
   controls if required by observed traffic. Do not rely on client throttling.
5. Restrict CORS to SINAG origins, bound request sizes, and ensure function,
   gateway, and Auth logs redact request bodies, passwords, email addresses,
   and tokens.

Required deployment configuration: deploy the Edge Function and set
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as
server-side function secrets. Add a distributed rate-limit provider or
gateway policy and its secret if the selected deployment platform does not
provide suitable limits. No browser environment variable for the service-role
key is allowed. The current account email and password remain valid for the
future ID login; no alternate password store is required.

## Dashboard configuration

- Keep Supabase email confirmations enabled.
- Add the production SINAG `/login` URL to Supabase Auth's allowed redirect
  URLs; signup requests this URL as `emailRedirectTo`.
- Keep Auth email/password rate limits and abuse protections enabled.
- Keep existing password reset email templates and allowed redirect URLs
  configured. Recovery remains email-based, even if TSI ID sign-in is added.

## Manual acceptance checks

### Signup, verification, and linking

- A correctly formatted issued ID and valid email/password create an Auth
  account and send a verification email; no participant row is read or changed
  by the browser before verification.
- Invalid ID format is rejected with the expected format hint. An unissued ID,
  already-linked ID, and ID linked to another Auth account all produce the same
  generic linking response without exposing another member's data.
- Before email verification, the member cannot enter the app. After verifying
  and signing in, the supplied ID is prefilled when available and links through
  the RPC.
- Repeating a link for the same Auth user and same ID succeeds idempotently;
  another Auth user cannot claim that ID; one Auth user cannot claim a second
  ID.
- An authenticated but unlinked user is redirected away from exams/results.
  A linked user can use existing exam sets, sessions, and results with the
  same Auth UUID ownership as before.

### Login and recovery

- Email plus the user's password signs in through Supabase Auth. Wrong email
  and wrong password show the same generic error; no credentials or tokens are
  logged.
- TSI ID login remains visibly unavailable until the Edge Function is live.
  After enablement, test valid linked ID/password, wrong password, unissued ID,
  unlinked ID, unverified Auth user, rate limits, and duplicate account cases;
  all failures must be generic and must not disclose an email or account
  existence.
- Password reset still sends the Supabase recovery email and updates the
  password through the recovery session. The UI gives an account-neutral
  response and recovery remains email-based.
