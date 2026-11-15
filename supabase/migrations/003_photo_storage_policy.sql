-- Storage objects need an UPDATE policy so a retried upload can overwrite a
-- partially uploaded object. SELECT/INSERT/DELETE already exist in migration 001.
do $$
begin
  create policy "photos bucket: owner only - update"
    on storage.objects for update
    using (
      bucket_id = 'customer-photos'
      and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
      bucket_id = 'customer-photos'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
exception
  when duplicate_object then null;
end $$;
