-- #88 (owner's decisions 2026-09-26): each entrant opens their own capsule, then everyone sees all results.
-- * The draw is still fixed at start. Opening order never changes a prize.
-- * From starts_at, an entrant calls lp_open. The snapshot then includes that user's own prize (myResults) only.
-- * All results (and the prize stock) stay hidden until reveal_at: starts_at + 10 s, or earlier the moment every
--   active entrant has opened. An entrant who leaves without opening is not waited for.
-- * next_ready_at moves with reveal_at (reveal_at + 15 s), so every existing round-active check stays as it is.
-- * Unchanged: the host-only start, 2 guests besides the host, pitch mode, lock order (room -> members -> rounds).

alter table public.lp_members add column if not exists opened_round integer not null default 0;
alter table public.lp_rounds add column if not exists reveal_at timestamptz;
-- Rounds before this migration keep their reveal time. Safe to re-run (tests re-apply migrations from #68 on).
update public.lp_rounds set reveal_at=starts_at where reveal_at is null;
alter table public.lp_rounds alter column reveal_at set not null;

-- Caller holds the room row FOR UPDATE. Reveals the latest round now when no active entrant is left unopened.
create or replace function public.lp_settle_open(p_room uuid) returns void
language plpgsql set search_path='' as $$
declare rd public.lp_rounds; v_at timestamptz;
begin
 select * into rd from public.lp_rounds where room=p_room and number=(select round_no from public.lp_rooms where id=p_room);
 if rd.number is null or rd.reveal_at<=now() then return; end if;
 if exists(select 1 from jsonb_array_elements(rd.results) item(value)
   join public.lp_members m on m.room=p_room and m.user_id=(item.value->>'userId')::uuid
   where m.active and m.opened_round<rd.number) then return; end if;
 v_at=greatest(now(),rd.starts_at);
 update public.lp_rounds set reveal_at=v_at,next_ready_at=v_at+interval '15 seconds' where room=p_room and number=rd.number;
end; $$;
revoke all on function public.lp_settle_open(uuid) from public,anon,authenticated;

-- An entrant opens the latest round after starts_at. Retrying is harmless.
create or replace function public.lp_open(p_room uuid,p_round integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rd public.lp_rounds;
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 select * into rd from public.lp_rounds where room=p_room and number=(select round_no from public.lp_rooms where id=p_room);
 -- Watchers (not in this draw), an older round and a round before starts_at cannot be opened.
 if rd.number is null or p_round is null or p_round<>rd.number or now()<rd.starts_at
  or not rd.results @> jsonb_build_array(jsonb_build_object('userId',auth.uid()::text)) then
   raise exception 'invalid-round';
 end if;
 update public.lp_members set opened_round=p_round,seen_at=now() where room=p_room and user_id=auth.uid() and opened_round<p_round;
 if found then
   perform public.lp_settle_open(p_room);
   perform public.lp_wake(p_room,jsonb_build_object('reason','open'));
 end if;
 return public.lp_snapshot(p_room);
end; $$;
revoke all on function public.lp_open(uuid,integer) from public,anon;
grant execute on function public.lp_open(uuid,integer) to authenticated;

-- Same as 20260926075123, plus 'open' among the fixed reasons.
create or replace function public.lp_wake(p_room uuid,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
declare v_reason text=case
 when p_payload->>'reason' in ('join','ready','leave','schedule','open') then p_payload->>'reason'
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

-- Same as 20260926033821, plus reveal_at (starts_at + 10 s) and next_ready_at after it.
create or replace function public.lp_draw(p_room uuid,p_request uuid) returns void
language plpgsql set search_path='' as $$
declare r public.lp_rooms; m record; prize_row record; pick integer; total integer; count_ready integer;
 results jsonb='[]'; start_time timestamptz; selected text; lucky uuid; top integer;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 -- F13: at least 2 active members besides the host.
 if public.lp_guest_count(p_room)<2 then raise exception 'need-more-players'; end if;
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
 -- Capsules appear 8 s after the commit. A scheduled start commits at or after scheduled_at, so this is never before scheduled_at + 8 s.
 -- #88: all results by starts_at + 10 s at the latest (earlier once every entrant opened), the next ready 15 s after that.
 start_time=clock_timestamp()+interval '8 seconds';
 insert into public.lp_rounds(room,number,request_id,starts_at,reveal_at,next_ready_at,results,guaranteed)
 values(p_room,r.round_no+1,p_request,start_time,start_time+interval '10 seconds',start_time+interval '25 seconds',results,lucky is not null);
 update public.lp_rooms set round_no=round_no+1,scheduled_at=null where id=p_room;
 update public.lp_members set ready=false where room=p_room;
 perform public.lp_wake(p_room,jsonb_build_object('number',r.round_no+1,'startsAt',start_time));
end; $$;

-- Same as 20260926075123, plus: an entrant who leaves without opening is not waited for.
create or replace function public.lp_leave(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 update public.lp_members set active=false,ready=false where room=p_room and user_id=auth.uid();
 perform public.lp_settle_open(p_room);
 perform public.lp_wake(p_room,jsonb_build_object('reason','leave'));
 -- Ledger and round results remain; rejoining never resets the balance.
end; $$;

-- Same as 20260926014051, except: results and stock are hidden until reveal_at (not starts_at); myResults also has
-- the caller's own prize of a round they opened; round adds revealAt, entrants (ids only) and opened (ids).
-- The deadline needs no write: it is only compared with now(). Lock modes are unchanged.
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
 'myResults',(select coalesce(jsonb_agg(jsonb_build_object('roundNo',past.number,'prize',item.value->>'prize') order by past.number),'[]'::jsonb)
   from public.lp_rounds past cross join lateral jsonb_array_elements(past.results) item(value)
   where past.room=p_room and item.value->>'userId'=auth.uid()::text
    and (past.reveal_at<=now() or (past.starts_at<=now() and past.number<=me.opened_round))),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname,'ready',ready,
 'online',seen_at>now()-interval '45 seconds') order by joined_at,user_id),'[]') from public.lp_members where room=p_room and active),
 'stock',case when rd.number is not null and now()<rd.reveal_at then null else (select coalesce(jsonb_agg(jsonb_build_object('prize',prize,'remaining',remaining) order by prize),'[]'::jsonb) from public.lp_stock where room=p_room) end,
 'round',case when rd.number is null then null else jsonb_build_object('number',rd.number,'startsAt',rd.starts_at,
 'revealAt',rd.reveal_at,'nextReadyAt',rd.next_ready_at,'guaranteed',rd.guaranteed,
 'entrants',(select coalesce(jsonb_agg(item.value->'userId' order by n),'[]'::jsonb) from jsonb_array_elements(rd.results) with ordinality item(value,n)),
 'opened',(select coalesce(jsonb_agg(item.value->'userId' order by n),'[]'::jsonb) from jsonb_array_elements(rd.results) with ordinality item(value,n)
   join public.lp_members m on m.room=p_room and m.user_id=(item.value->>'userId')::uuid where m.opened_round>=rd.number),
 'results',case when now()>=rd.reveal_at then rd.results else null end) end);
end; $$;
