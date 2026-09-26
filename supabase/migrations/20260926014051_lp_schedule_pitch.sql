-- F07: host-scheduled start and pitch mode (one participant per round is guaranteed the top prize).
-- Lock order is unchanged: the room row first, then members, stock and rounds.
alter table public.lp_rooms
 add column scheduled_at timestamptz,
 add column pitch_guarantee boolean not null default false,
 add column last_schedule jsonb;
alter table public.lp_rounds add column guaranteed boolean not null default false;

-- Best-effort wake-up hint. Notification failure cannot roll back the ledger.
create function public.lp_wake(p_room uuid,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
begin
 begin
   if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
     execute 'select realtime.send($1,$2,$3,$4)' using p_payload,'round','lp:'||p_room::text,true;
   end if;
 exception when others then
   null; -- Clients still poll the authoritative snapshot.
 end;
end; $$;

-- One all-or-nothing draw. Callers hold the room row FOR UPDATE and have checked who may start.
create function public.lp_draw(p_room uuid,p_request uuid) returns void
language plpgsql set search_path='' as $$
declare r public.lp_rooms; m record; prize_row record; pick integer; total integer; count_ready integer;
 results jsonb='[]'; start_time timestamptz; selected text; lucky uuid; top integer;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 select count(*) into count_ready from public.lp_members where room=p_room and active and ready and seen_at>now()-interval '45 seconds';
 if count_ready=0 then raise exception 'nobody-ready'; end if;
 select coalesce(sum(remaining),0) into total from public.lp_stock where room=p_room;
 if total<count_ready then raise exception 'sold-out'; end if;
 -- Pitch mode: reserve one real top prize for one entrant chosen uniformly. With no top prize left, draw normally.
 if r.pitch_guarantee then
   select remaining into top from public.lp_stock where room=p_room and prize='plush';
   if coalesce(top,0)>0 then
     select user_id into lucky from public.lp_members where room=p_room and active and ready and seen_at>now()-interval '45 seconds' order by random() limit 1;
     update public.lp_stock set remaining=remaining-1 where room=p_room and prize='plush';
     total=total-1;
   end if;
 end if;
 for m in select * from public.lp_members where room=p_room and active and ready and seen_at>now()-interval '45 seconds' order by joined_at,user_id loop
   if m.balance<500 then raise exception 'insufficient-coins'; end if;
   selected=null;
   if m.user_id=lucky then
     selected='plush';
   else
     pick=floor(random()*total)::integer;
     for prize_row in select * from public.lp_stock where room=p_room order by prize loop
       if pick<prize_row.remaining then
         update public.lp_stock set remaining=remaining-1 where room=p_room and prize=prize_row.prize;
         selected=prize_row.prize;
         exit;
       end if;
       pick=pick-prize_row.remaining;
     end loop;
     if selected is null then raise exception 'sold-out'; end if;
     total=total-1;
   end if;
   results=results||jsonb_build_array(jsonb_build_object('userId',m.user_id,'nickname',m.nickname,'prize',selected));
   update public.lp_members set balance=balance-500 where room=p_room and user_id=m.user_id;
 end loop;
 -- Reveal 8 s after the commit. A scheduled start commits at or after scheduled_at, so the reveal is never before scheduled_at + 8 s.
 start_time=clock_timestamp()+interval '8 seconds';
 insert into public.lp_rounds(room,number,request_id,starts_at,next_ready_at,results,guaranteed)
 values(p_room,r.round_no+1,p_request,start_time,start_time+interval '15 seconds',results,lucky is not null);
 update public.lp_rooms set round_no=round_no+1,scheduled_at=null where id=p_room;
 update public.lp_members set ready=false where room=p_room;
 perform public.lp_wake(p_room,jsonb_build_object('number',r.round_no+1,'startsAt',start_time));
end; $$;

-- Runs a due schedule once. Caller holds the room row FOR UPDATE and has checked scheduled_at<=now().
create function public.lp_fire_schedule(p_room uuid,p_at timestamptz) returns void
language plpgsql set search_path='' as $$
declare req uuid=md5(p_room::text||'@'||extract(epoch from p_at)::text)::uuid; outcome text; started integer;
begin
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
end; $$;

create or replace function public.lp_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; rd public.lp_rounds; me public.lp_members; due boolean;
begin
 -- Pick the lock mode from an unlocked read. Only a due schedule takes the exclusive room lock, so
 -- ordinary polls keep sharing it. Never upgrade SHARE to UPDATE: two sharers upgrading would deadlock.
 select scheduled_at is not null and scheduled_at<=now() into due from public.lp_rooms where id=p_room and expires_at>now();
 if coalesce(due,false) then
   select * into r from public.lp_rooms where id=p_room and expires_at>now() for update;
 else
   select * into r from public.lp_rooms where id=p_room and expires_at>now() for share;
 end if;
 if not found then raise exception 'room-unavailable'; end if;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 update public.lp_members set seen_at=now() where room=p_room and user_id=auth.uid() and seen_at<now()-interval '10 seconds';
 -- Re-checked under the lock: a concurrent caller may already have started or the host cancelled.
 if due and r.scheduled_at is not null and r.scheduled_at<=now() then
   perform public.lp_fire_schedule(p_room,r.scheduled_at);
   select * into r from public.lp_rooms where id=p_room;
 end if;
 select * into me from public.lp_members where room=p_room and user_id=auth.uid();
 select * into rd from public.lp_rounds where room=p_room and number=r.round_no;
 return jsonb_build_object('id',r.id,'invite',r.invite,'host',r.host,'expiresAt',r.expires_at,
 'serverTime',clock_timestamp(),'self',auth.uid(),'balance',me.balance,'roundNo',r.round_no,
 'scheduledAt',r.scheduled_at,'pitchMode',r.pitch_guarantee,'lastSchedule',r.last_schedule,
 'myResults',(select coalesce(jsonb_agg(jsonb_build_object('roundNo',past.number,'prize',item.value->>'prize') order by past.number),'[]'::jsonb) from public.lp_rounds past cross join lateral jsonb_array_elements(past.results) item(value) where past.room=p_room and past.starts_at<=now() and item.value->>'userId'=auth.uid()::text),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname,'ready',ready,
 'online',seen_at>now()-interval '45 seconds') order by joined_at,user_id),'[]') from public.lp_members where room=p_room and active),
 'stock',case when rd.number is not null and now()<rd.starts_at then null else (select coalesce(jsonb_agg(jsonb_build_object('prize',prize,'remaining',remaining) order by prize),'[]'::jsonb) from public.lp_stock where room=p_room) end,
 'round',case when rd.number is null then null else jsonb_build_object('number',rd.number,'startsAt',rd.starts_at,'nextReadyAt',rd.next_ready_at,
 'guaranteed',rd.guaranteed,'results',case when now()>=rd.starts_at then rd.results else null end) end);
end; $$;

create or replace function public.lp_start(p_room uuid,p_request uuid,p_expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_expected is null or p_expected<0 then raise exception 'invalid-round'; end if;
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and request_id=p_request) then return public.lp_snapshot(p_room); end if;
 if r.round_no<>p_expected then raise exception 'stale-round'; end if;
 perform public.lp_draw(p_room,p_request);
 -- Starting now replaces any schedule (lp_draw clears scheduled_at).
 update public.lp_rooms set last_schedule=null where id=p_room;
 return public.lp_snapshot(p_room);
end; $$;

-- Host picks 1, 3, 5 or 10 minutes from now; null cancels. Must leave a minute before the room expires.
create function public.lp_schedule(p_room uuid,p_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; v_at timestamptz;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
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

create function public.lp_set_pitch_mode(p_room uuid,p_on boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if p_on is null then raise exception 'invalid-request'; end if;
 if r.pitch_guarantee<>p_on then
   update public.lp_rooms set pitch_guarantee=p_on where id=p_room;
   perform public.lp_wake(p_room,jsonb_build_object('pitchMode',p_on));
 end if;
 return public.lp_snapshot(p_room);
end; $$;

-- Owner decision (2026-09-26): up to 100 active members per room, host included. The UI shows only the count.
-- New rooms get a pool three times larger (same proportions) so a full room can draw more than once.
create or replace function public.lp_create(p_request uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 12 then raise exception 'invalid-name'; end if;
 -- Client keeps request UUID while retrying; insert conflict waits on the original transaction.
 insert into public.lp_rooms(id,host) values(p_request,auth.uid()) on conflict (id) do nothing;
 select * into r from public.lp_rooms where id=p_request for update;
 if r.host<>auth.uid() then raise exception 'room-unavailable'; end if;
 insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),trim(p_name)) on conflict do nothing;
 -- Dedicated, explicitly fictional pitch pool. 300 draws, 500 coins, per-room stock.
 insert into public.lp_stock(room,prize,remaining) values(r.id,'plush',30),(r.id,'pouch',90),(r.id,'badge',180) on conflict do nothing;
 return public.lp_snapshot(r.id);
end; $$;

create or replace function public.lp_join(p_invite uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; m public.lp_members;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_invite is null then raise exception 'room-unavailable'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 12 then raise exception 'invalid-name'; end if;
 select * into r from public.lp_rooms where invite=p_invite and expires_at>now() for update;
 if not found then raise exception 'room-unavailable'; end if;
 select * into m from public.lp_members where room=r.id and user_id=auth.uid();
 if not coalesce(m.active,false) and (select count(*) from public.lp_members where room=r.id and active)>=100 then raise exception 'room-full'; end if;
 insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),trim(p_name))
 on conflict(room,user_id) do update set nickname=excluded.nickname,active=true,seen_at=now();
 return public.lp_snapshot(r.id);
end; $$;

-- Internal helpers run only inside the RPCs above; they are not Data API endpoints.
revoke all on function public.lp_wake(uuid,jsonb),public.lp_draw(uuid,uuid),public.lp_fire_schedule(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.lp_schedule(uuid,integer),public.lp_set_pitch_mode(uuid,boolean) from public,anon;
grant execute on function public.lp_schedule(uuid,integer),public.lp_set_pitch_mode(uuid,boolean) to authenticated;
