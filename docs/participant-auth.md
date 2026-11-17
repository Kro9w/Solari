# SINAG participant signup and authentication

## Signup identity flow

- Signup calls the public `sinag-signup` Edge Function with the email, the
  password chosen by the member, and their TSI ID. The browser makes no query
  to `auth.users` or `sinag_participants`.
- The function checks that the TSI ID matches the deployed ID format and is an
  issued, unclaimed participant row. It then creates and confirms the Auth
  account through the server-only Supabase Admin API. Participant `first_name`
  and `surname` are copied to Auth user metadata (`first_name`, `last_name`)
  for compatibility with existing display code; `sinag_participants` remains
  the canonical name record. This flow does not send a verification email.
- The function sets `sinag_participant_id` in server-managed Auth app metadata.
  The user cannot change this metadata through the browser. The ID is therefore
  carried through account setup without asking the member to enter it again.
- After email/password sign-in, the protected-route check calls the no-argument
  `complete_sinag_participant_link()` RPC if needed. That function reads the
  fixed participant ID from Auth app metadata, checks `auth.uid()` and the
  auto-confirmed Auth state, then links the row. It accepts no client-supplied
  ID. The member no longer sees a separate onboarding screen.
- The Auth account's email/password remains the credential. The TSI ID checks
  signup eligibility and selects the participant row; it is not a password.
  With email confirmation disabled, this flow does not prove ownership of the
  submitted email address.
- Sol Bot currently assigns TSI IDs without notifying participants. An
  agreed Discord/admin process must communicate the issued ID before signup is
  announced; this flow does not claim to deliver it.
- Protected app and exam routes check `is_sinag_participant_linked()` and
  require a confirmed Auth session plus participant link. Since auto-confirm
  is enabled, `email_confirmed_at` is not proof of email ownership. Exam
  sessions and results continue to use
  their existing Auth UUIDs.
- Login currently supports Email. TSI ID is shown as unavailable until the
  secure server-side authentication endpoint below is deployed. The browser
  never resolves a participant ID to an email.

## Schema and RPC inspection

The deployed contract supplied for this work defines `sinag_participants` with
unique `participant_id`, unique `discord_user_id bigint`, and optional unique
`auth_user_id uuid`, plus RLS/grants that prevent public table access. It
defines `issue_sinag_participant_id(bigint,text,text)` for service-side ID
issuance. The repository previously referenced `link_sinag_participant` and
`is_sinag_participant_linked`, but their SQL definitions are not present in
this checkout and the deployment database is not connected here. The added
migration introduces `complete_sinag_participant_link()` and revokes the
client-callable ID-argument linking function if it exists. Verify the deployed
RPC definition and grants before applying the migration.

The offboarding cleanup migration drops `allowed_surnames` and the obsolete
`sinag_participant_counters` table, clears exam result rows, and resets
participant-to-Auth links while preserving issued TSI IDs and participant names.
The rate-limit table is not participant identity data and remains required by
the signup function.

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

Signup and linking require deploying `sinag-signup` and applying
`202611170002_sinag_server_signup_link.sql`. Set `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SINAG_APP_ORIGIN`, and a random
`SINAG_RATE_LIMIT_PEPPER` as server-side function secrets. `verify_jwt` is off
because signup is unauthenticated; the function restricts CORS to
`SINAG_APP_ORIGIN` and uses database-backed per-IP and per-ID rate limits.
Never add the service-role key to browser environment variables.

Deploy the migration and function before deploying the signup UI. The existing
client-callable ID-argument linking RPC is revoked by the migration, so schedule
the cutover with the new UI deployment. Already-linked accounts continue to
work; legacy unlinked accounts need the assisted recovery path below.

## Dashboard configuration

- Signup confirms new accounts in the trusted Edge Function because an issued
  TSI ID is the eligibility check. No email-confirmation dashboard setting is
  required for signup.
- Add the production SINAG `/login` URL to Supabase Auth's allowed redirect
  URLs; the Edge Function requests this URL as `emailRedirectTo`.
- Keep Auth email/password rate limits and abuse protections enabled.
- Password recovery still sends email through Supabase Auth. Without SMTP,
  recovery mail may not reach reviewees; configure SMTP later if self-service
  password recovery is needed.

Existing Auth accounts created before this server-side flow may not have
`sinag_participant_id` in app metadata. Accounts that are already linked remain
usable. Unlinked legacy accounts need an administrator-assisted mapping or a
separately designed verified recovery flow; the system must not guess a
participant match from a name or email.

## Manual acceptance checks

### Signup, eligibility, and linking

- A correctly formatted issued ID and valid email/password create an auto-
  confirmed Auth
  account, populate Auth name metadata from the participant row, bind the ID in
  server-managed app metadata, and send no verification email. The browser does
  not read participant or Auth rows.
- Invalid ID format is rejected with the expected format hint. An unissued ID,
  already-linked ID, and ID linked to another Auth account all produce the same
  generic linking response without exposing another member's data.
- A signed-in user with an unlinked account is linked during the protected-route
  check and only enters the app after the link is confirmed.
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
