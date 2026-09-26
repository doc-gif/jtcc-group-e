-- F15: private photos of real goods for the pitch.
-- The owner's permission (2026-09-26) covers the pitch and the people involved only, and goods photos only.
-- The photos live only in this private bucket. They are never in the repository, public/, the preview or the production build.
-- Uploads happen only through the Dashboard (service role). anon/authenticated get no INSERT, UPDATE or DELETE policy.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('pitch-goods', 'pitch-goods', false, 1048576, array['image/jpeg']);

-- True while the signed-in user is an active member of an open (not expired) room, or the host of one.
-- SECURITY DEFINER so the storage policy can check membership without any direct table grant (lp_* tables have none).
create function public.lp_can_view_photos() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.lp_rooms r
  where r.expires_at>now()
   and (r.host=auth.uid()
    or exists(select 1 from public.lp_members m where m.room=r.id and m.user_id=auth.uid() and m.active)));
$$;
revoke all on function public.lp_can_view_photos() from public, anon;
grant execute on function public.lp_can_view_photos() to authenticated;

-- Read only. The subquery form lets Postgres evaluate the membership check once per statement.
create policy lp_pitch_goods_read on storage.objects for select to authenticated
 using (bucket_id='pitch-goods' and (select public.lp_can_view_photos()));
