-- T03 contract draft. Do not apply remotely before T13 schema/security review and T14 migration task.
-- Pitch-only room ledger: no payment, shipping, or access to the legacy local demo balance.
create table public.lp_rooms (
  id uuid primary key default gen_random_uuid(), invite uuid not null unique default gen_random_uuid(),
  host uuid not null, expires_at timestamptz not null default now()+interval '2 hours',
  round_no integer not null default 0
);
create table public.lp_members (
  room uuid references public.lp_rooms on delete cascade, user_id uuid not null,
  nickname text not null check(char_length(nickname) between 1 and 12),
  balance integer not null default 3000 check(balance>=0), ready boolean not null default false,
  active boolean not null default true, seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(), primary key(room,user_id)
);
create table public.lp_stock (
  room uuid references public.lp_rooms on delete cascade, prize text not null,
  remaining integer not null check(remaining>=0), primary key(room,prize)
);
create table public.lp_rounds (
  room uuid references public.lp_rooms on delete cascade, number integer not null,
  request_id uuid not null, starts_at timestamptz not null, next_ready_at timestamptz not null, results jsonb not null,
  primary key(room,number), unique(room,request_id), check(next_ready_at>=starts_at)
);
alter table public.lp_rooms enable row level security;
alter table public.lp_members enable row level security;
alter table public.lp_stock enable row level security;
alter table public.lp_rounds enable row level security;
revoke all on public.lp_rooms,public.lp_members,public.lp_stock,public.lp_rounds from anon,authenticated;

create function public.lp_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lp_members m join public.lp_rooms r on r.id=m.room
 where m.room=p_room and m.user_id=auth.uid() and m.active and r.expires_at>now());
$$;

create function public.lp_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; rd public.lp_rounds; me public.lp_members;
begin
 -- Lock the room before membership, round and stock reads. Mutating RPCs lock room first.
 select * into r from public.lp_rooms where id=p_room and expires_at>now() for share;
 if not found then raise exception 'room-unavailable'; end if;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 update public.lp_members set seen_at=now() where room=p_room and user_id=auth.uid() and seen_at<now()-interval '10 seconds';
 select * into me from public.lp_members where room=p_room and user_id=auth.uid();
 select * into rd from public.lp_rounds where room=p_room and number=r.round_no;
 return jsonb_build_object('id',r.id,'invite',r.invite,'host',r.host,'expiresAt',r.expires_at,
 'serverTime',clock_timestamp(),'self',auth.uid(),'balance',me.balance,'roundNo',r.round_no,
 'myResults',(select coalesce(jsonb_agg(jsonb_build_object('roundNo',past.number,'prize',item.value->>'prize') order by past.number),'[]'::jsonb) from public.lp_rounds past cross join lateral jsonb_array_elements(past.results) item(value) where past.room=p_room and past.starts_at<=now() and item.value->>'userId'=auth.uid()::text),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname,'ready',ready,
 'online',seen_at>now()-interval '45 seconds') order by joined_at,user_id),'[]') from public.lp_members where room=p_room and active),
 'stock',case when rd.number is not null and now()<rd.starts_at then null else (select coalesce(jsonb_agg(jsonb_build_object('prize',prize,'remaining',remaining) order by prize),'[]'::jsonb) from public.lp_stock where room=p_room) end,
 'round',case when rd.number is null then null else jsonb_build_object('number',rd.number,'startsAt',rd.starts_at,'nextReadyAt',rd.next_ready_at,
 'results',case when now()>=rd.starts_at then rd.results else null end) end);
end; $$;

create function public.lp_create(p_request uuid,p_name text) returns jsonb
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
 -- Dedicated, explicitly fictional pitch pool. 100 draws, 500 coins, per-room stock.
 insert into public.lp_stock(room,prize,remaining) values(r.id,'plush',10),(r.id,'pouch',30),(r.id,'badge',60) on conflict do nothing;
 return public.lp_snapshot(r.id);
end; $$;

create function public.lp_join(p_invite uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; m public.lp_members;
begin
 if auth.uid() is null then raise exception 'auth-required'; end if;
 if p_invite is null then raise exception 'room-unavailable'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 12 then raise exception 'invalid-name'; end if;
 select * into r from public.lp_rooms where invite=p_invite and expires_at>now() for update;
 if not found then raise exception 'room-unavailable'; end if;
 select * into m from public.lp_members where room=r.id and user_id=auth.uid();
 if not coalesce(m.active,false) and (select count(*) from public.lp_members where room=r.id and active)>=40 then raise exception 'room-full'; end if;
 insert into public.lp_members(room,user_id,nickname) values(r.id,auth.uid(),trim(p_name))
 on conflict(room,user_id) do update set nickname=excluded.nickname,active=true,seen_at=now();
 return public.lp_snapshot(r.id);
end; $$;

create function public.lp_ready(p_room uuid,p_ready boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 if p_ready is null then raise exception 'invalid-ready'; end if;
 if p_ready and (select balance from public.lp_members where room=p_room and user_id=auth.uid())<500 then raise exception 'insufficient-coins'; end if;
 update public.lp_members set ready=p_ready,seen_at=now() where room=p_room and user_id=auth.uid();
 return public.lp_snapshot(p_room);
end; $$;

create function public.lp_start(p_room uuid,p_request uuid,p_expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms; m record; prize_row record; pick integer; total integer; count_ready integer;
 results jsonb='[]'; start_time timestamptz; selected text;
begin
 if p_request is null then raise exception 'invalid-request'; end if;
 if p_expected is null or p_expected<0 then raise exception 'invalid-round'; end if;
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 if r.host<>auth.uid() then raise exception 'host-required'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and request_id=p_request) then return public.lp_snapshot(p_room); end if;
 if r.round_no<>p_expected then raise exception 'stale-round'; end if;
 if exists(select 1 from public.lp_rounds where room=p_room and next_ready_at>now()) then raise exception 'round-active'; end if;
 select count(*) into count_ready from public.lp_members where room=p_room and active and ready and seen_at>now()-interval '45 seconds';
 if count_ready=0 then raise exception 'nobody-ready'; end if;
 select coalesce(sum(remaining),0) into total from public.lp_stock where room=p_room;
 if total<count_ready then raise exception 'sold-out'; end if;
 for m in select * from public.lp_members where room=p_room and active and ready and seen_at>now()-interval '45 seconds' order by joined_at,user_id loop
   if m.balance<500 then raise exception 'insufficient-coins'; end if;
   selected=null;
   pick=floor(random()*total)::integer;
   for prize_row in select * from public.lp_stock where room=p_room order by prize loop
     if pick<prize_row.remaining then
       update public.lp_stock set remaining=remaining-1 where room=p_room and prize=prize_row.prize;
       selected=prize_row.prize;
       results=results||jsonb_build_array(jsonb_build_object('userId',m.user_id,'nickname',m.nickname,'prize',selected));
       exit;
     end if;
     pick=pick-prize_row.remaining;
   end loop;
   if selected is null then raise exception 'sold-out'; end if;
   total=total-1;
   update public.lp_members set balance=balance-500 where room=p_room and user_id=m.user_id;
 end loop;
 start_time=clock_timestamp()+interval '8 seconds';
 insert into public.lp_rounds values(p_room,r.round_no+1,p_request,start_time,start_time+interval '15 seconds',results);
 update public.lp_rooms set round_no=round_no+1 where id=p_room;
 update public.lp_members set ready=false where room=p_room;
 -- One best-effort wake-up for the round. Notification failure cannot roll back the ledger.
 begin
   if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
     execute 'select realtime.send($1,$2,$3,$4)' using jsonb_build_object('number',r.round_no+1,'startsAt',start_time),'round','lp:'||p_room::text,true;
   end if;
 exception when others then
   null; -- Clients still poll the authoritative snapshot.
 end;
 return public.lp_snapshot(p_room);
end; $$;

create function public.lp_claim_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.lp_rooms;
begin
 select * into r from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 if exists(select 1 from public.lp_members where room=p_room and user_id=r.host and active and seen_at>now()-interval '45 seconds') then raise exception 'host-online'; end if;
 update public.lp_rooms set host=auth.uid() where id=p_room;
 return public.lp_snapshot(p_room);
end; $$;

create function public.lp_leave(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.lp_rooms where id=p_room for update;
 if not public.lp_is_member(p_room) then raise exception 'room-unavailable'; end if;
 update public.lp_members set active=false,ready=false where room=p_room and user_id=auth.uid();
 -- Ledger and round results remain; rejoining never resets the balance.
end; $$;

revoke all on function public.lp_is_member(uuid),public.lp_snapshot(uuid),public.lp_create(uuid,text),
 public.lp_join(uuid,text),public.lp_ready(uuid,boolean),public.lp_start(uuid,uuid,integer),public.lp_claim_host(uuid),public.lp_leave(uuid) from public,anon;
grant execute on function public.lp_is_member(uuid),public.lp_snapshot(uuid),public.lp_create(uuid,text),
 public.lp_join(uuid,text),public.lp_ready(uuid,boolean),public.lp_start(uuid,uuid,integer),public.lp_claim_host(uuid),public.lp_leave(uuid) to authenticated;

-- Realtime is optional. Polling is authoritative and works before Realtime initializes.
create function public.lp_can_receive(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lp_rooms r where 'lp:'||r.id::text=p_topic and public.lp_is_member(r.id));
$$;
revoke all on function public.lp_can_receive(text) from public,anon;
grant execute on function public.lp_can_receive(text) to authenticated;