-- #88 (owner's decisions 2026-09-26, second round): each entrant turns the handle at their own pace.
-- * No countdown: the round starts at the commit (starts_at = commit time) and capsules can be opened right away.
-- * No time limit on opening. An entrant who has not turned yet keeps the turning screen until they finish.
-- * Everyone's results (and the prize stock) are revealed at a fixed reveal_at = start + 15 s, even when every
--   entrant already opened (no early reveal: lp_settle_open is dropped). Results of entrants who have not opened
--   yet are included from then on; the app keeps the caller's own prize hidden until they open.
-- * next_ready_at = reveal_at + 15 s. The draw, the host-only start, 2 guests besides the host and pitch mode are
--   unchanged. Lock order is unchanged (room -> members -> rounds).

-- Same as 20260926104012, except the start time and the fixed reveal.
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
 -- #88: no countdown. Everyone's results 15 s after the start, the next ready 15 s after that.
 start_time=clock_timestamp();
 insert into public.lp_rounds(room,number,request_id,starts_at,reveal_at,next_ready_at,results,guaranteed)
 values(p_room,r.round_no+1,p_request,start_time,start_time+interval '15 seconds',start_time+interval '30 seconds',results,lucky is not null);
 update public.lp_rooms set round_no=round_no+1,scheduled_at=null where id=p_room;
 update public.lp_members set ready=false where room=p_room;
 perform public.lp_wake(p_room,jsonb_build_object('number',r.round_no+1,'startsAt',start_time));
end; $$;

-- Same as 20260926104012, except: no starts_at check (a round is openable from its commit) and no early reveal.
create or replace function public.lp_open(p_room uuid,p_round integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rd public.lp_rounds;
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 select * into rd from public.lp_rounds where room=p_room and number=(select round_no from public.lp_rooms where id=p_room);
 -- Watchers (not in this draw) and an older round cannot be opened.
 if rd.number is null or p_round is null or p_round<>rd.number
  or not rd.results @> jsonb_build_array(jsonb_build_object('userId',auth.uid()::text)) then
   raise exception 'invalid-round';
 end if;
 update public.lp_members set opened_round=p_round,seen_at=now() where room=p_room and user_id=auth.uid() and opened_round<p_round;
 if found then perform public.lp_wake(p_room,jsonb_build_object('reason','open')); end if;
 return public.lp_snapshot(p_room);
end; $$;

-- Same as 20260926075123 (before #88): leaving no longer moves the reveal.
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

drop function if exists public.lp_settle_open(uuid);

-- Same as 20260926104012, except myResults: a round the caller opened counts from its commit (no starts_at check).
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
    and (past.reveal_at<=now() or past.number<=me.opened_round)),
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
