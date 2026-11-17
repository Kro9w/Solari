-- Remove legacy data as part of the SINAG offboarding reset.
-- Keep participant IDs and approved names so eligible users can register again.

-- Detach old Auth UUIDs before the Auth users are flushed. New accounts can
-- then claim the retained participant IDs through the signup/link flow.
update public.sinag_participants
   set auth_user_id = null,
       updated_at = clock_timestamp()
 where auth_user_id is not null;

-- Clear result rows while preserving the table and its exam relationships.
truncate table public.exam_results;

-- These tables are no longer used by the application or the current issuer.
drop table if exists public.allowed_surnames;
drop table if exists public.sinag_participant_counters;
