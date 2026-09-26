-- F10 follow-up 2 (PR #35 review):
-- * Names reject every character of the Unicode general categories Cc and Cf (Unicode 17, the same set as
--   /[\p{Cc}\p{Cf}]/u in src/realtime/protocol.ts), not a hand-written subset. The ranges are listed with chr()
--   so the source has no invisible characters; scripts/shared-db.test.mjs compares all code points with the JS set.
-- * Line and paragraph separators (U+2028, U+2029) fold into one space like the other spaces, as in the JS side.
-- * lp_rename is refused while a round is active (until next_ready_at): the committed results keep the names
--   they were drawn with, so a rename mid-round would show two names for one person.

-- Cc and Cf code points (U+0001-U+10FFFF), as a regular-expression bracket.
create function public.lp_name_forbidden() returns text
language sql immutable set search_path='' as $$
 select '['||chr(1)||'-'||chr(31)||chr(127)||'-'||chr(159)||chr(173)||chr(1536)||'-'||chr(1541)||chr(1564)||chr(1757)
   ||chr(1807)||chr(2192)||'-'||chr(2193)||chr(2274)||chr(6158)||chr(8203)||'-'||chr(8207)||chr(8234)||'-'||chr(8238)
   ||chr(8288)||'-'||chr(8292)||chr(8294)||'-'||chr(8303)||chr(65279)||chr(65529)||'-'||chr(65531)||chr(69821)
   ||chr(69837)||chr(78896)||'-'||chr(78911)||chr(113824)||'-'||chr(113827)||chr(119155)||'-'||chr(119162)
   ||chr(917505)||chr(917536)||'-'||chr(917631)||']';
$$;
revoke all on function public.lp_name_forbidden() from public,anon,authenticated;

create or replace function public.lp_clean_name(p_name text) returns text
language sql immutable set search_path='' as $$
 select case when v is null or char_length(v) not between 1 and 12 or v ~ public.lp_name_forbidden() then null else v end
 from (select btrim(regexp_replace(p_name,'['||chr(9)||'-'||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||'-'||chr(8202)
   ||chr(8232)||'-'||chr(8233)||chr(8239)||chr(8287)||chr(12288)||']+',' ','g')) v) s;
$$;

create or replace function public.lp_rename(p_room uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_name text=public.lp_clean_name(p_name);
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 -- Only in the lobby: not from a scheduled or manual start until the next round may be readied.
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'rename-locked'; end if;
 if v_name is null then raise exception 'invalid-name'; end if;
 if public.lp_name_taken(p_room,v_name) then raise exception 'name-taken' using hint=public.lp_name_suggestion(p_room,v_name); end if;
 update public.lp_members set nickname=v_name,seen_at=now() where room=p_room and user_id=auth.uid() and nickname<>v_name;
 if found then perform public.lp_wake(p_room,jsonb_build_object('member',auth.uid())); end if;
 return public.lp_snapshot(p_room);
end; $$;
