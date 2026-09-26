-- F10 (owner decisions 2026-09-26): only the owner can be host, and display names are unique per room.
-- * A room is created, or its host resumed on another device, only with a valid host key (the owner's
--   secret host link #/host/<key>). Participants can no longer take over: lp_claim_host is dropped. A host's
--   absence no longer transfers anything; scheduled rounds still start without the host (F07).
-- * Only a salted SHA-256 of each key is stored, in a table anon/authenticated cannot read. The raw key never
--   reaches the database: scripts/host-key.mjs prints the key and an insert with salt and hash only.
-- * Names are unique among a room's active members, compared after NFKC, whitespace removal and lower-casing.
--   Joining without a name gives a friendly unique one; a taken name fails with name-taken and a suggestion.
-- Lock order is unchanged (room row first, then members, stock and rounds) and every room-locking RPC fires an
-- overdue schedule first (lp_fire_due).

create table public.lp_host_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null default '' check(char_length(label)<=60),
  salt bytea not null check(octet_length(salt)>=16),
  hash bytea not null check(octet_length(hash)=32),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
-- Failed host-key checks per signed-in user, for a coarse brute-force limit. Rows older than an hour are purged.
create table public.lp_host_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index lp_host_attempts_user_at on public.lp_host_attempts(user_id,at);
create index lp_host_attempts_at on public.lp_host_attempts(at);
alter table public.lp_host_keys enable row level security;
alter table public.lp_host_attempts enable row level security;
revoke all on public.lp_host_keys,public.lp_host_attempts from public,anon,authenticated;

alter table public.lp_rooms add column host_key uuid references public.lp_host_keys(id) on delete set null;
create index lp_rooms_host_key on public.lp_rooms(host_key,expires_at);

-- Display form: whitespace runs (including U+3000) become one space, trimmed, 1-12 characters. Null when invalid.
create function public.lp_clean_name(p_name text) returns text
language sql immutable set search_path='' as $$
 select case when v is null or char_length(v) not between 1 and 12 or v ~ '[[:cntrl:]]' then null else v end
 from (select btrim(regexp_replace(p_name,'[\s　]+',' ','g')) v) s;
$$;
-- Comparison form: NFKC (full/half width), no whitespace, lower case. "Ｍｏｍｏ　２" and "momo2" are the same name.
create function public.lp_name_key(p_name text) returns text
language sql immutable set search_path='' as $$
 select lower(regexp_replace(normalize(p_name,NFKC),'[\s　]+','','g'));
$$;
alter table public.lp_members add column name_key text generated always as (public.lp_name_key(nickname)) stored;
-- Backstop only: every name change holds the room lock and checks lp_name_taken first.
create unique index lp_members_active_name on public.lp_members(room,name_key) where active;

create function public.lp_name_taken(p_room uuid,p_name text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.lp_members where room=p_room and active and user_id<>auth.uid()
  and name_key=public.lp_name_key(p_name));
$$;

-- "ゲスト さくら12": a small fixed word list and a number. Caller holds the room lock.
create function public.lp_auto_name(p_room uuid) returns text
language plpgsql set search_path='' as $$
declare words text[]=array['さくら','もも','いちご','りんご','みかん','ぶどう','ゆず','くるみ','あんず','すもも','れもん','めろん'];
 v text; i integer;
begin
 for i in 1..40 loop
   v='ゲスト '||words[1+floor(random()*array_length(words,1))::integer]||(1+floor(random()*99))::integer;
   if not public.lp_name_taken(p_room,v) then return v; end if;
 end loop;
 -- At most 100 active members, so this always finds a free name quickly.
 for i in 100..9999 loop
   v='ゲスト '||words[1+i%array_length(words,1)]||i;
   if not public.lp_name_taken(p_room,v) then return v; end if;
 end loop;
 raise exception 'room-full';
end; $$;

-- "もも" -> "もも2", "もも2" -> "もも3": the first free number, shortened to fit 12 characters.
create function public.lp_name_suggestion(p_room uuid,p_name text) returns text
language plpgsql set search_path='' as $$
declare base text=coalesce(nullif(btrim(regexp_replace(p_name,'[0-9０-９]+$','')),''),p_name); v text; n integer;
begin
 for n in 2..999 loop
   v=btrim(left(base,12-char_length(n::text)))||n;
   if not public.lp_name_taken(p_room,v) then return v; end if;
 end loop;
 return public.lp_auto_name(p_room);
end; $$;

-- Coarse limit: 5 failed checks per user per minute. One check at a time per user, so parallel guesses
-- cannot slip past the count. The caller returns (does not raise) a failure so the attempt row is kept.
create function public.lp_host_key_check(p_key text,out key_id uuid,out failure text)
language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('lp_host_key:'||auth.uid()::text,0));
 delete from public.lp_host_attempts where at<now()-interval '1 hour';
 if (select count(*) from public.lp_host_attempts where user_id=auth.uid() and at>now()-interval '1 minute')>=5 then
   failure='too-many-attempts';
   return;
 end if;
 if p_key ~ '^[A-Za-z0-9_-]{32,128}$' then
   -- Every live key is hashed with its own salt and the 32-byte digests compared, so the time taken does not
   -- depend on how much of the presented key is right.
   select k.id into key_id from public.lp_host_keys k
    where k.revoked_at is null and (k.expires_at is null or k.expires_at>now())
      and k.hash=sha256(k.salt||convert_to(p_key,'UTF8'))
    limit 1;
 end if;
 if key_id is null then
   insert into public.lp_host_attempts(user_id) values(auth.uid());
   failure='host-key-invalid';
 end if;
end; $$;

-- Participants can no longer take over as host.
drop function public.lp_claim_host(uuid);
-- Creating a room now needs a host key.
drop function public.lp_create(uuid,text);

create function public.lp_create(p_request uuid,p_key text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; chk record; v_name text;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_name is not null then
   v_name=public.lp_clean_name(p_name);
   if v_name is null then raise exception 'invalid-name'; end if;
 end if;
 select * into chk from public.lp_host_key_check(p_key);
 -- Returned, not raised: raising would roll back the recorded failed attempt.
 if chk.failure is not null then return jsonb_build_object('error',chk.failure); end if;
 -- Client keeps request UUID while retrying; insert conflict waits on the original transaction.
 insert into public.lp_rooms(id,host,host_key) values(p_request,auth.uid(),chk.key_id) on conflict (id) do nothing;
 select * into r from public.lp_rooms where id=p_request for update;
 if r.host<>auth.uid() or r.expires_at<=now() then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(r.id);
 if not exists(select 1 from public.lp_members where room=r.id and user_id=auth.uid()) then
   insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),coalesce(v_name,public.lp_auto_name(r.id)));
 end if;
 -- Dedicated, explicitly fictional pitch pool. 300 draws, 500 coins, per-room stock.
 insert into public.lp_stock(room,prize,remaining) values(r.id,'plush',30),(r.id,'pouch',90),(r.id,'badge',180) on conflict do nothing;
 return public.lp_snapshot(r.id);
end; $$;

-- The owner opens the host link on another device (a new anonymous user) and becomes host again. Without a room
-- id it resumes the key's newest open room. Every other member's seat, coins and results stay as they are.
create function public.lp_resume_host(p_key text,p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; chk record; old uuid; mine public.lp_members;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 select * into chk from public.lp_host_key_check(p_key);
 if chk.failure is not null then return jsonb_build_object('error',chk.failure); end if;
 select * into r from public.lp_rooms where host_key=chk.key_id and expires_at>now() and (p_room is null or id=p_room)
  order by expires_at desc limit 1 for update;
 if not found then raise exception 'no-room'; end if;
 perform public.lp_fire_due(r.id);
 old=r.host;
 if old<>auth.uid() then
   if exists(select 1 from public.lp_members where room=r.id and user_id=auth.uid()) then
     -- This device already has its own seat here: keep it and release the old host seat.
     update public.lp_members set active=false,ready=false where room=r.id and user_id=old;
   else
     -- Move the host's seat (name, coins, ready) and saved results to this device.
     update public.lp_members set user_id=auth.uid() where room=r.id and user_id=old;
     update public.lp_rounds set results=(
       select jsonb_agg(case when item->>'userId'=old::text then jsonb_set(item,'{userId}',to_jsonb(auth.uid()::text)) else item end order by n)
       from jsonb_array_elements(results) with ordinality x(item,n))
      where room=r.id and results @> jsonb_build_array(jsonb_build_object('userId',old::text));
   end if;
   update public.lp_rooms set host=auth.uid() where id=r.id;
 end if;
 select * into mine from public.lp_members where room=r.id and user_id=auth.uid();
 if mine.user_id is null or not mine.active then
   if (select count(*) from public.lp_members where room=r.id and active)>=100 then raise exception 'room-full'; end if;
   insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),
     case when mine.user_id is not null and not public.lp_name_taken(r.id,mine.nickname) then mine.nickname else public.lp_auto_name(r.id) end)
   on conflict(room,user_id) do update set nickname=excluded.nickname,active=true,seen_at=now();
 else
   update public.lp_members set seen_at=now() where room=r.id and user_id=auth.uid();
 end if;
 perform public.lp_wake(r.id,jsonb_build_object('host',auth.uid()));
 return public.lp_snapshot(r.id);
end; $$;

-- p_name null: keep this user's earlier name if still free, else a friendly unique one.
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
 return public.lp_snapshot(r.id);
end; $$;

create function public.lp_rename(p_room uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_name text=public.lp_clean_name(p_name);
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 perform public.lp_fire_due(p_room);
 if v_name is null then raise exception 'invalid-name'; end if;
 if public.lp_name_taken(p_room,v_name) then raise exception 'name-taken' using hint=public.lp_name_suggestion(p_room,v_name); end if;
 update public.lp_members set nickname=v_name,seen_at=now() where room=p_room and user_id=auth.uid() and nickname<>v_name;
 if found then perform public.lp_wake(p_room,jsonb_build_object('member',auth.uid())); end if;
 return public.lp_snapshot(p_room);
end; $$;

-- Internal helpers run only inside the RPCs above; they are not Data API endpoints.
revoke all on function public.lp_clean_name(text),public.lp_name_key(text),public.lp_name_taken(uuid,text),
 public.lp_auto_name(uuid),public.lp_name_suggestion(uuid,text),public.lp_host_key_check(text) from public,anon,authenticated;
revoke all on function public.lp_create(uuid,text,text),public.lp_resume_host(text,uuid),public.lp_rename(uuid,text) from public,anon;
grant execute on function public.lp_create(uuid,text,text),public.lp_resume_host(text,uuid),public.lp_rename(uuid,text) to authenticated;
