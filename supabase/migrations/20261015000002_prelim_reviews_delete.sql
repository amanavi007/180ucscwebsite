-- Execs can delete a prelim review (for example a test run). Authors cannot delete their own.
create policy prelim_reviews_delete on public.prelim_reviews
  for delete to authenticated using (public.is_exec());
