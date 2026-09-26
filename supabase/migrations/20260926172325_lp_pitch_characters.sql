-- #144 (plan D) / #150: private character art for the limited-release app (限定公開アプリ) only.
-- The art lives only in this private bucket. It is never in the repository, public/, the preview or any build.
-- Uploads happen only through the Dashboard (service role). anon/authenticated get no INSERT, UPDATE or DELETE policy.
-- Written to be re-runnable (the PGlite test re-applies the migrations after #68): each statement ends in the same state.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('pitch-characters', 'pitch-characters', false, 307200, array['image/png','image/webp'])
on conflict (id) do nothing;

-- True while the signed-in user is an active member of an open (not expired) room, or the host of one.
-- Today the same condition as lp_can_view_photos(). It is a separate function on purpose:
-- when #58 adds rooms of the general-release app (kind='demo'), narrow only this one to kind='pitch'
-- (photos may be shown in the general-release app, the characters may not).
-- SECURITY DEFINER so the storage policy can check membership without any direct table grant (lp_* tables have none).
create or replace function public.lp_can_view_characters() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.lp_rooms r
  where r.expires_at>now()
   and (r.host=auth.uid()
    or exists(select 1 from public.lp_members m where m.room=r.id and m.user_id=auth.uid() and m.active)));
$$;
revoke all on function public.lp_can_view_characters() from public, anon;
grant execute on function public.lp_can_view_characters() to authenticated;

-- Read only. The subquery form lets Postgres evaluate the membership check once per statement.
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='lp_pitch_characters_read') then
  create policy lp_pitch_characters_read on storage.objects for select to authenticated
   using (bucket_id='pitch-characters' and (select public.lp_can_view_characters()));
 end if;
end
$$;
