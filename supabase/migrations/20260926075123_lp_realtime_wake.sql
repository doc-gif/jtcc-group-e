-- #68: tell every device in a room about joins, ready, leave and starts within seconds (Realtime Broadcast).
-- Broadcast stays a wake-up hint only: receivers fetch lp_snapshot again, and 15 s polling remains the fallback.
-- * Receive policy: only an active member (host included) of an open room may join the private channel lp:<roomId>.
--   There is no INSERT policy, so clients cannot send on these channels.
-- * lp_wake sends a fixed, minimal payload {roomId, roundNo, reason}: no names, keys, invite codes or results.
--   Callers from earlier migrations still pass their old hint objects; only a fixed reason word is taken from them.
-- * lp_join, lp_ready, lp_leave and a scheduled start that did not start now wake the room too. lp_draw (start and
--   scheduled start), lp_schedule, lp_set_pitch_mode, lp_rename and lp_resume_host already did.
-- realtime.send writes to realtime.messages inside the caller's transaction, so a rolled-back RPC sends nothing and
-- receivers never fetch before the change commits. Lock order and every other statement are unchanged.

-- Parse the topic instead of scanning rooms. Non-matching topics are refused.
create or replace function public.lp_can_receive(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_topic is null or p_topic !~ '^lp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return public.lp_is_member(substr(p_topic,4)::uuid);
end; $$;
revoke all on function public.lp_can_receive(text) from public,anon;
grant execute on function public.lp_can_receive(text) to authenticated;

-- Realtime is initialized on the hosted project. A database without it (tests) keeps working by polling.
do $$ begin
 if to_regclass('realtime.messages') is not null
  and not exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='lp_receive_round') then
   execute 'create policy lp_receive_round on realtime.messages for select to authenticated using (extension=''broadcast'' and public.lp_can_receive((select realtime.topic())))';
 end if;
end $$;

-- Best-effort wake-up hint. Notification failure cannot roll back the ledger.
create or replace function public.lp_wake(p_room uuid,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
declare v_reason text=case
 when p_payload->>'reason' in ('join','ready','leave','schedule') then p_payload->>'reason'
 when p_payload ? 'number' then 'start'
 when p_payload ? 'scheduledAt' then 'schedule'
 when p_payload ? 'pitchMode' then 'pitch-mode'
 when p_payload ? 'member' then 'rename'
 when p_payload ? 'host' then 'host'
 else 'change' end;
begin
 begin
   if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
     execute 'select realtime.send($1,$2,$3,$4)'
      using jsonb_build_object('roomId',p_room,'roundNo',(select round_no from public.lp_rooms where id=p_room),'reason',v_reason),
       'round','lp:'||p_room::text,true;
   end if;
 exception when others then
   null; -- Clients still poll the authoritative snapshot.
 end;
end; $$;
revoke all on function public.lp_wake(uuid,jsonb) from public,anon,authenticated;

-- Same as 20260926033821, plus the wake after seating the member.
create or replace function public.lp_join(p_invite uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; m public.lp_members; v_name text;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_invite is null then raise exception 'room-unavailable'; end if;
 if p_name is not null then
   v_name=public.lp_clean_name(p_name);
   if v_name is null then raise exception 'invalid-name'; end if;
 end if;
 select * into r from public.lp_rooms where invite=p_invite and expires_at>now() for update;
 if not found then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(r.id);
 select * into m from public.lp_members where room=r.id and user_id=auth.uid();
 if not coalesce(m.active,false) and (select count(*) from public.lp_members where room=r.id and active)>=100 then raise exception 'room-full'; end if;
 if v_name is null then
   v_name=case when m.user_id is not null and not public.lp_name_taken(r.id,m.nickname) then m.nickname else public.lp_auto_name(r.id) end;
 elsif public.lp_name_taken(r.id,v_name) then
   raise exception 'name-taken' using hint=public.lp_name_suggestion(r.id,v_name);
 end if;
 insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),v_name)
 on conflict(room,user_id) do update set nickname=excluded.nickname,active=true,seen_at=now();
 perform public.lp_wake(r.id,jsonb_build_object('reason','join'));
 -- F13: the new member may be the second guest a due schedule was waiting for.
 perform public.lp_fire_due(r.id);
 return public.lp_snapshot(r.id);
end; $$;

-- Same as 20260926015853, plus the wake after the change.
create or replace function public.lp_ready(p_room uuid,p_ready boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 if p_ready is null then raise exception 'invalid-ready'; end if;
 if p_ready and (select balance from public.lp_members where room=p_room and user_id=auth.uid())<500 then raise exception 'insufficient-coins'; end if;
 update public.lp_members set ready=p_ready,seen_at=now() where room=p_room and user_id=auth.uid();
 perform public.lp_wake(p_room,jsonb_build_object('reason','ready'));
 return public.lp_snapshot(p_room);
end; $$;

-- Same as 20260926015853, plus the wake after the change.
create or replace function public.lp_leave(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 update public.lp_members set active=false,ready=false where room=p_room and user_id=auth.uid();
 perform public.lp_wake(p_room,jsonb_build_object('reason','leave'));
 -- Ledger and round results remain; rejoining never resets the balance.
end; $$;

-- Same as 20260926033821, plus a wake when the schedule ends without a start (lp_draw wakes on a start).
create or replace function public.lp_fire_schedule(p_room uuid,p_at timestamptz) returns void
language plpgsql set search_path='' as $$
declare req uuid=md5(p_room::text||'@'||extract(epoch from p_at)::text)::uuid; outcome text; started integer;
begin
 if public.lp_guest_count(p_room)<2 then return; end if;
 update public.lp_rooms set scheduled_at=null where id=p_room;
 if exists(select 1 from public.lp_rounds where room=p_room and request_id=req) then return; end if;
 begin
   perform public.lp_draw(p_room,req);
   select round_no into started from public.lp_rooms where id=p_room;
   outcome='started';
 exception when others then
   -- The subtransaction rolls back every coin, stock and round change of the failed draw.
   outcome=case when sqlerrm in ('nobody-ready','sold-out','insufficient-coins') then sqlerrm else 'failed' end;
   if outcome='failed' then raise warning 'lp scheduled start failed: %',sqlerrm; end if;
   started=null;
 end;
 update public.lp_rooms set last_schedule=jsonb_build_object('status',outcome,'scheduledAt',p_at,'roundNo',started) where id=p_room;
 if outcome<>'started' then perform public.lp_wake(p_room,jsonb_build_object('reason','schedule')); end if;
end; $$;
