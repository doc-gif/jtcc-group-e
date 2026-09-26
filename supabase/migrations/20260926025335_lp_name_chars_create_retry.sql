-- F10 follow-up (PR #33 review):
-- * Names: collapse every Unicode space (not only what the locale's \s matches) and reject control and invisible
--   format characters (zero-width, bidi overrides, BOM), the same set as cleanName in src/realtime/protocol.ts.
--   Characters are written with chr() so the source has no invisible characters.
-- * lp_create: a retry of this user's own open room returns it before the host-key check, so a lost response
--   followed by a key rotation or the attempt limit cannot turn a created room into an error.
create or replace function public.lp_clean_name(p_name text) returns text
language sql immutable set search_path='' as $$
 select case when v is null or char_length(v) not between 1 and 12
   or v ~ ('['||chr(1)||'-'||chr(31)||chr(127)||'-'||chr(159)||chr(173)||chr(1564)||chr(6158)||chr(8203)||'-'||chr(8207)
     ||chr(8232)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||chr(65529)||'-'||chr(65531)||']')
   then null else v end
 from (select btrim(regexp_replace(p_name,'['||chr(9)||'-'||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||'-'||chr(8202)
   ||chr(8239)||chr(8287)||chr(12288)||']+',' ','g')) v) s;
$$;

create or replace function public.lp_create(p_request uuid,p_key text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; chk record; v_name text;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_name is not null then
   v_name=public.lp_clean_name(p_name);
   if v_name is null then raise exception 'invalid-name'; end if;
 end if;
 -- Idempotent retry: this user's own open room needs no second key check.
 select * into r from public.lp_rooms where id=p_request and host=auth.uid() and expires_at>now() for update;
 if not found then
   select * into chk from public.lp_host_key_check(p_key);
   -- Returned, not raised: raising would roll back the recorded failed attempt.
   if chk.failure is not null then return jsonb_build_object('error',chk.failure); end if;
   -- Client keeps request UUID while retrying; insert conflict waits on the original transaction.
   insert into public.lp_rooms(id,host,host_key) values(p_request,auth.uid(),chk.key_id) on conflict (id) do nothing;
   select * into r from public.lp_rooms where id=p_request for update;
   if r.host<>auth.uid() or r.expires_at<=now() then raise exception 'room-unavailable'; end if;
 end if;
 perform public.lp_fire_due(r.id);
 if not exists(select 1 from public.lp_members where room=r.id and user_id=auth.uid()) then
   insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),coalesce(v_name,public.lp_auto_name(r.id)));
 end if;
 -- Dedicated, explicitly fictional pitch pool. 300 draws, 500 coins, per-room stock.
 insert into public.lp_stock(room,prize,remaining) values(r.id,'plush',30),(r.id,'pouch',90),(r.id,'badge',180) on conflict do nothing;
 return public.lp_snapshot(r.id);
end; $$;
