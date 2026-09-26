-- F07 follow-up: every RPC that takes the room lock runs an overdue schedule first.
-- Before this, a host's lp_schedule/lp_start after the time (or anyone's ready/leave/join/claim) acted
-- before the schedule fired, so the schedule could be replaced or cancelled without ever starting.
-- If the RPC then fails, the whole transaction (including the fired start) rolls back and the next
-- snapshot fires the schedule again; nothing is lost and the start still happens once.

-- Caller holds the room row FOR UPDATE.
create function public.lp_fire_due(p_room uuid) returns void
language plpgsql set search_path='' as $$
declare due_at timestamptz;
begin
 select scheduled_at into due_at from public.lp_rooms where id=p_room;
 if due_at is not null and due_at<=now() then perform public.lp_fire_schedule(p_room,due_at); end if;
end; $$;
revoke all on function public.lp_fire_due(uuid) from public,anon,authenticated;

create or replace function public.lp_join(p_invite uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; m public.lp_members;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_invite is null then raise exception 'room-unavailable'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 12 then raise exception 'invalid-name'; end if;
 select * into r from public.lp_rooms where invite=p_invite and expires_at>now() for update;
 if not found then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(r.id);
 select * into m from public.lp_members where room=r.id and user_id=auth.uid();
 if not coalesce(m.active,false) and (select count(*) from public.lp_members where room=r.id and active)>=100 then raise exception 'room-full'; end if;
 insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),trim(p_name))
 on conflict(room,user_id) do update set nickname=excluded.nickname,active=true,seen_at=now();
 return public.lp_snapshot(r.id);
end; $$;

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
 return public.lp_snapshot(p_room);
end; $$;

create or replace function public.lp_start(p_room uuid,p_request uuid,p_expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_expected is null or p_expected<0 then raise exception 'invalid-round'; end if;
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 select * into r from public.lp_rooms where id=p_room;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and request_id=p_request) then return public.lp_snapshot(p_room); end if;
 if r.round_no<>p_expected then raise exception 'stale-round'; end if;
 perform public.lp_draw(p_room,p_request);
 -- Starting now replaces any schedule (lp_draw clears scheduled_at).
 update public.lp_rooms set last_schedule=null where id=p_room;
 return public.lp_snapshot(p_room);
end; $$;

create or replace function public.lp_schedule(p_room uuid,p_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; v_at timestamptz;
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 select * into r from public.lp_rooms where id=p_room;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if p_minutes is null then
   if r.scheduled_at is not null then
     update public.lp_rooms set scheduled_at=null,last_schedule=jsonb_build_object('status','cancelled','scheduledAt',r.scheduled_at,'roundNo',null) where id=p_room;
     perform public.lp_wake(p_room,jsonb_build_object('scheduledAt',null));
   end if;
   return public.lp_snapshot(p_room);
 end if;
 if p_minutes not in (1,3,5,10) then raise exception 'invalid-schedule'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 v_at=now()+make_interval(mins=>p_minutes);
 if v_at>r.expires_at-interval '1 minute' then raise exception 'invalid-schedule'; end if;
 update public.lp_rooms set scheduled_at=v_at,last_schedule=null where id=p_room;
 perform public.lp_wake(p_room,jsonb_build_object('scheduledAt',v_at));
 return public.lp_snapshot(p_room);
end; $$;

create or replace function public.lp_set_pitch_mode(p_room uuid,p_on boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 select * into r from public.lp_rooms where id=p_room;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if p_on is null then raise exception 'invalid-request'; end if;
 if r.pitch_guarantee<>p_on then
   update public.lp_rooms set pitch_guarantee=p_on where id=p_room;
   perform public.lp_wake(p_room,jsonb_build_object('pitchMode',p_on));
 end if;
 return public.lp_snapshot(p_room);
end; $$;

create or replace function public.lp_claim_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 if exists(select 1 from public.lp_members where room=p_room and user_id=r.host and active and seen_at>now()-interval '45 seconds') then raise exception 'host-online'; end if;
 update public.lp_rooms set host=auth.uid() where id=p_room;
 return public.lp_snapshot(p_room);
end; $$;

create or replace function public.lp_leave(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 update public.lp_members set active=false,ready=false where room=p_room and user_id=auth.uid();
 -- Ledger and round results remain; rejoining never resets the balance.
end; $$;
