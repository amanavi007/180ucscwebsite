-- Applicants now pick where to meet when they book, so the location lives on
-- the booking. Older bookings keep '' and fall back to the slot's location.
alter table public.coffee_chat_bookings
  add column location text not null default '';
