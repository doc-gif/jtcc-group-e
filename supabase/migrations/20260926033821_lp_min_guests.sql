-- F13 (owner decision 2026-09-26): a round starts only with at least 2 active members besides the host
-- (3 people or more with the host). Guests are counted from active seats, not online presence.
-- * Starting now (lp_start) with fewer guests fails with need-more-players and changes nothing.
-- * A due schedule with fewer guests does not start: it stays pending (no lastSchedule) and starts as soon as
--   the second guest joins. lp_join fires a due schedule again after seating the new member, so that member
--   counts. The host can still change or cancel the waiting schedule, and pitch mode follows the same rule.
-- Lock order is unchanged (room row first, then members, stock and rounds). lp_draw and lp_fire_schedule run with
-- the room row held FOR UPDATE, so the count cannot change under them.

-- Active members other than the host. Caller holds the room row.
create function public.lp_guest_count(p_room uuid) returns integer
language sql stable set search_path='' as $$
 select count(*)::integer from public.lp_members m join public.lp_rooms r on r.id=m.room
 where m.room=p_room and m.active and m.user_id<>r.host;
$$;
revoke all on function public.lp_guest_count(uuid) from public,anon,authenticated;

-- Same as F07, plus the guest check right after round-active.
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
 -- Reveal 8 s after the commit. A scheduled start commits at or after scheduled_at, so the reveal is never before scheduled_at + 8 s.
 start_time=clock_timestamp()+interval '8 seconds';
 insert into public.lp_rounds(room,number,request_id,starts_at,next_ready_at,results,guaranteed)
 values(p_room,r.round_no+1,p_request,start_time,start_time+interval '15 seconds',results,lucky is not null);
 update public.lp_rooms set round_no=round_no+1,scheduled_at=null where id=p_room;
 update public.lp_members set ready=false where room=p_room;
 perform public.lp_wake(p_room,jsonb_build_object('number',r.round_no+1,'startsAt',start_time));
end; $$;

-- Same as F07, but a due schedule without 2 guests waits: it is neither cleared nor reported.
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
end; $$;

-- Same as F10, plus a second lp_fire_due after the member is seated: a schedule waiting for guests starts with
-- the joining member counted.
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
 -- F13: the new member may be the second guest a due schedule was waiting for.
 perform public.lp_fire_due(r.id);
 return public.lp_snapshot(r.id);
end; $$;
