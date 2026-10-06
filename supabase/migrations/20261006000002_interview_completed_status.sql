-- A booking whose interview has already happened is retired to 'completed' the
-- next time that applicant is re-invited and books, so last cycle's confirmed
-- booking no longer blocks them (the partial unique indexes only cover
-- status = 'confirmed').
alter table public.interview_bookings drop constraint if exists interview_bookings_status_check;
alter table public.interview_bookings
  add constraint interview_bookings_status_check check (status in ('confirmed', 'cancelled', 'completed'));
