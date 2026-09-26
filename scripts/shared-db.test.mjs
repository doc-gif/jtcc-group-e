import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHostKey, hostKeyRecord, hostKeySql } from './host-key.mjs'
let db
// A throwaway key for this in-memory database only. Real keys are never committed.
const KEY=createHostKey()
const users=Array.from({length:102},()=>randomUUID())
const room=randomUUID()
let invite
const migrations=['supabase/migrations/20260926000239_lp_shared_opening.sql','supabase/migrations/20260926000446_lp_is_member_internal.sql','supabase/migrations/20260926014051_lp_schedule_pitch.sql','supabase/migrations/20260926015853_lp_fire_due_first.sql','supabase/migrations/20260926023427_lp_host_key_names.sql','supabase/migrations/20260926023642_lp_host_attempts_pk.sql','supabase/migrations/20260926025335_lp_name_chars_create_retry.sql','supabase/migrations/20260926031422_lp_name_cf_rename_idle.sql','supabase/migrations/20260926033821_lp_min_guests.sql','supabase/migrations/20260926052120_lp_pitch_goods_photos.sql']
// Supabase Storage is not in PGlite. A minimal stand-in (F15): the real schema has more columns; the grants mirror Supabase (RLS decides).
const STORAGE_STUB=`create schema storage;
 create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 grant select on storage.buckets to anon,authenticated;`
const call=async(user,sql,args=[])=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
 return (await db.query(sql,args)).rows[0]?.result
}
beforeAll(async()=>{
 db=new PGlite()
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema realtime;create table realtime.messages(extension text,topic text,payload jsonb);
 create function realtime.topic() returns text language sql as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.messages values('broadcast',topic,payload)$$;`)
 await db.exec(STORAGE_STUB)
 for(const file of migrations) await db.exec(await readFile(file,'utf8'))
 await db.exec(hostKeySql('test',hostKeyRecord(KEY)))
},30000)
afterAll(async()=>{await db?.close()})
test('100 seats, idempotent joins, atomic shared results, reconnect and private authorization',async()=>{
 const first=await call(users[0],'select public.lp_create($1,$3,$2) result',[room,'ホスト',KEY])
 invite=first.invite
 expect(first).toMatchObject({scheduledAt:null,pitchMode:false,lastSchedule:null})
 await expect(call(users[0],'select public.lp_create($1,$3,$2) result',[null,'再作成',KEY])).rejects.toThrow('invalid-request')
 await expect(call(users[0],'select public.lp_join($1,$2) result',[null,'参加'])).rejects.toThrow('room-unavailable')
 const duplicate=await call(users[0],'select public.lp_create($1,$3,$2) result',[room,'ホスト',KEY])
 expect(duplicate.id).toBe(first.id)
 for(let i=1;i<100;i++) await call(users[i],'select public.lp_join($1,$2) result',[invite,`ゲスト${i}`])
 await expect(call(users[100],'select public.lp_join($1,$2) result',[invite,'満員'])).rejects.toThrow('room-full')
 const again=await call(users[99],'select public.lp_join($1,$2) result',[invite,'復帰'])
 expect(again.members).toHaveLength(100)
 expect(again.stock).toEqual([{prize:'badge',remaining:180},{prize:'plush',remaining:30},{prize:'pouch',remaining:90}])
 for(let i=0;i<100;i++) await call(users[i],'select public.lp_ready($1,true) result',[room])
 await expect(call(users[1],'select public.lp_start($1,$2,0) result',[room,randomUUID()])).rejects.toThrow('host-required')
 const request=randomUUID()
 const start=await call(users[0],'select public.lp_start($1,$2,0) result',[room,request])
 await expect(call(users[0],'select public.lp_ready($1,true) result',[room])).rejects.toThrow('round-active')
 expect(start.balance).toBe(2500);expect(start.round.results).toBeNull();expect(start.stock).toBeNull();expect(start.myResults).toEqual([])
 expect(Date.parse(start.round.nextReadyAt)-Date.parse(start.round.startsAt)).toBe(15000)
 const repeated=await call(users[0],'select public.lp_start($1,$2,0) result',[room,request])
 expect(repeated.roundNo).toBe(1);expect(repeated.balance).toBe(2500)
 await expect(call(users[0],'select public.lp_start($1,$2,0) result',[room,randomUUID()])).rejects.toThrow('stale-round')
 await db.exec("update public.lp_rounds set starts_at=now()-interval '30 seconds', next_ready_at=now()-interval '15 seconds'")
 const views=[]
 for(let i=0;i<100;i++) views.push(await call(users[i],'select public.lp_snapshot($1) result',[room]))
 expect(views.every(v=>JSON.stringify(v.round)===JSON.stringify(views[0].round))).toBe(true)
 expect(views[0].round.results).toHaveLength(100)
 expect(views[0].round.guaranteed).toBe(false)
 expect(views[0].myResults).toHaveLength(1)
 expect(views[0].stock.reduce((sum,s)=>sum+s.remaining,0)).toBe(200)
 expect((await db.query('select count(*)::int count from realtime.messages')).rows[0].count).toBe(1)
 await call(users[99],'select public.lp_leave($1) result',[room])
 const late=await call(users[100],'select public.lp_join($1,$2) result',[invite,'遅れて参加'])
 expect(late.round.results.some(r=>r.userId===users[100])).toBe(false)
 await call(users[100],'select public.lp_leave($1) result',[room])
 const back=await call(users[99],'select public.lp_join($1,$2) result',[invite,'復帰'])
 expect(back.balance).toBe(2500)
 expect(await call(users[1],'select public.lp_can_receive($1) result',[`lp:${room}`])).toBe(true)
 expect(await call(users[101],'select public.lp_can_receive($1) result',[`lp:${room}`])).toBe(false)
 await expect(call(users[101],'select public.lp_snapshot($1) result',[room])).rejects.toThrow('room-unavailable')
 await db.exec('set role authenticated')
 await expect(db.query('select * from public.lp_rounds')).rejects.toThrow('permission denied')
 await expect(db.query('select public.lp_is_member($1)',[room])).rejects.toThrow('permission denied')
 await db.exec('reset role')
},60000)
test('transaction rolls back every coin and stock mutation when stock is insufficient',async()=>{
 for(let i=1;i<100;i++) await call(users[i],'select public.lp_ready($1,true) result',[room])
 await db.exec('update public.lp_stock set remaining=0')
 await expect(call(users[0],'select public.lp_start($1,$2,1) result',[room,randomUUID()])).rejects.toThrow('sold-out')
 const state=await call(users[1],'select public.lp_snapshot($1) result',[room]);expect(state.balance).toBe(2500);expect(state.roundNo).toBe(1)
 await db.exec("update public.lp_rooms set expires_at=now()-interval '1 second'")
 await expect(call(users[1],'select public.lp_snapshot($1) result',[room])).rejects.toThrow('room-unavailable')
},30000)

test('optional notification failure does not roll back an authoritative round', async()=>{
 const freshRoom=randomUUID()
 const {invite:freshInvite}=await call(users[0],'select public.lp_create($1,$3,$2) result',[freshRoom,'ホスト',KEY])
 // F13: two guests besides the host.
 for(const [i,name] of [[1,'ゲストA'],[2,'ゲストB']]) await call(users[i],'select public.lp_join($1,$2) result',[freshInvite,name])
 await call(users[0],'select public.lp_ready($1,true) result',[freshRoom])
 await db.exec("create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin raise exception 'simulated-notification-failure'; end$$")
 const started=await call(users[0],'select public.lp_start($1,$2,0) result',[freshRoom,randomUUID()])
 expect(started.roundNo).toBe(1)
 expect(started.balance).toBe(2500)
 expect(started.stock).toBeNull()
 expect((await db.query('select count(*)::int count from public.lp_rounds where room=$1',[freshRoom])).rows[0].count).toBe(1)
})
test('optional Broadcast policy is rerunnable and refuses absent Realtime', async()=>{
 const policy=await readFile('supabase/drafts/optional_broadcast.sql','utf8')
 await db.exec(policy)
 await db.exec(policy)
 const rows=(await db.query("select count(*)::int count from pg_policies where schemaname='realtime' and tablename='messages' and policyname='lp_receive_round'")).rows
 expect(rows[0].count).toBe(1)
 await db.exec('drop table realtime.messages cascade')
 await expect(db.exec(policy)).rejects.toThrow('Realtime is not initialized')
})
test('core room ledger works before Realtime initializes and blocks a departed member', async()=>{
 const isolated=new PGlite()
 try {
  await isolated.exec("create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$")
  await isolated.exec(STORAGE_STUB)
  for(const file of migrations) await isolated.exec(await readFile(file,'utf8'))
  await isolated.exec(hostKeySql('test',hostKeyRecord(KEY)))
  const owner=randomUUID()
  const id=randomUUID()
  await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  const created=(await isolated.query('select public.lp_create($1,$3,$2) result',[id,'ホスト',KEY])).rows[0].result
  expect(created.id).toBe(id)
  // F13: two guests besides the host.
  for(const name of ['ゲストA','ゲストB']) {
   await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()])
   await isolated.query('select public.lp_join($1,$2)',[created.invite,name])
  }
  await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await isolated.query('select public.lp_ready($1,true)',[id])
  const started=(await isolated.query('select public.lp_start($1,$2,0) result',[id,randomUUID()])).rows[0].result
  expect(started.roundNo).toBe(1)
  expect(started.balance).toBe(2500)
  expect(started.round.results).toBeNull()
  await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()])
  await expect(isolated.query('select public.lp_start($1,$2,1)',[id,randomUUID()])).rejects.toThrow('room-unavailable')
  await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  await isolated.query('select public.lp_leave($1)',[id])
  await expect(isolated.query('select public.lp_snapshot($1)',[id])).rejects.toThrow('room-unavailable')
 } finally {
  await isolated.close()
 }
},30000)

describe('F07: scheduled start and pitch mode', () => {
 const [host,friend,watcher]=[randomUUID(),randomUUID(),randomUUID()]
 const snap=(user,id)=>call(user,'select public.lp_snapshot($1) result',[id])
 const openRoom=async()=>{
  const id=randomUUID()
  const created=await call(host,'select public.lp_create($1,$3,$2) result',[id,'ホスト',KEY])
  await call(friend,'select public.lp_join($1,$2) result',[created.invite,'友だち'])
  await call(watcher,'select public.lp_join($1,$2) result',[created.invite,'見守り'])
  return id
 }
 const due=id=>db.query("update public.lp_rooms set scheduled_at=now()-interval '1 second' where id=$1 and scheduled_at is not null",[id])
 const finishRound=id=>db.query("update public.lp_rounds set starts_at=now()-interval '30 seconds',next_ready_at=now()-interval '15 seconds' where room=$1",[id])
 const balances=async id=>Object.fromEntries((await db.query('select user_id,balance from public.lp_members where room=$1',[id])).rows.map(row=>[row.user_id,row.balance]))

 test('only the host schedules, changes or cancels a start before expiry; everyone sees it', async()=>{
  const id=await openRoom()
  await expect(call(friend,'select public.lp_schedule($1,3) result',[id])).rejects.toThrow('host-required')
  await expect(call(randomUUID(),'select public.lp_schedule($1,3) result',[id])).rejects.toThrow('room-unavailable')
  for(const minutes of [0,2,4,15,-1]) await expect(call(host,'select public.lp_schedule($1,$2) result',[id,minutes])).rejects.toThrow('invalid-schedule')
  const before=Date.now()
  const scheduled=await call(host,'select public.lp_schedule($1,3) result',[id])
  const at=Date.parse(scheduled.scheduledAt)
  expect(at-before).toBeGreaterThan(170_000);expect(at-before).toBeLessThan(190_000)
  expect((await snap(watcher,id)).scheduledAt).toBe(scheduled.scheduledAt)
  const changed=await call(host,'select public.lp_schedule($1,10) result',[id])
  expect(Date.parse(changed.scheduledAt)-at).toBeGreaterThan(400_000)
  expect(changed.lastSchedule).toBeNull()
  const cancelled=await call(host,'select public.lp_schedule($1,null) result',[id])
  expect(cancelled.scheduledAt).toBeNull()
  expect(cancelled.lastSchedule).toEqual({status:'cancelled',scheduledAt:changed.scheduledAt,roundNo:null})
  expect((await snap(friend,id)).lastSchedule.status).toBe('cancelled')
  // The schedule (plus one minute for the reveal) must fit before the room expires.
  await db.query("update public.lp_rooms set expires_at=now()+interval '5 minutes' where id=$1",[id])
  await expect(call(host,'select public.lp_schedule($1,5) result',[id])).rejects.toThrow('invalid-schedule')
  expect((await call(host,'select public.lp_schedule($1,3) result',[id])).scheduledAt).not.toBeNull()
  // Starting now replaces the schedule.
  await call(friend,'select public.lp_ready($1,true) result',[id])
  const now=await call(host,'select public.lp_start($1,$2,0) result',[id,randomUUID()])
  expect(now).toMatchObject({roundNo:1,scheduledAt:null,lastSchedule:null})
  await expect(call(host,'select public.lp_schedule($1,1) result',[id])).rejects.toThrow('round-active')
 },30000)

 test('a non-host snapshot starts a due schedule once while the host is offline', async()=>{
  const id=await openRoom()
  await call(host,'select public.lp_ready($1,true) result',[id])
  await call(friend,'select public.lp_ready($1,true) result',[id])
  const scheduled=await call(host,'select public.lp_schedule($1,1) result',[id])
  const waiting=await snap(watcher,id)
  expect(waiting).toMatchObject({roundNo:0,scheduledAt:scheduled.scheduledAt})
  await db.query("update public.lp_members set seen_at=now()-interval '60 seconds' where room=$1 and user_id=$2",[id,host])
  await due(id)
  const dueAt=(await db.query('select scheduled_at from public.lp_rooms where id=$1',[id])).rows[0].scheduled_at
  const started=await snap(watcher,id)
  expect(started).toMatchObject({roundNo:1,scheduledAt:null,lastSchedule:{status:'started',roundNo:1}})
  expect(Date.parse(started.lastSchedule.scheduledAt)).toBe(dueAt.getTime())
  expect(started.round.results).toBeNull()
  expect(started.stock).toBeNull()
  expect(Date.parse(started.round.startsAt)-dueAt.getTime()).toBeGreaterThanOrEqual(8000)
  // Online ready members at that moment only: the offline host keeps their coins.
  expect(await balances(id)).toEqual({[host]:3000,[friend]:2500,[watcher]:3000})
  for(const user of [friend,watcher,host,friend]) expect((await snap(user,id)).roundNo).toBe(1)
  expect((await db.query('select count(*)::int count from public.lp_rounds where room=$1',[id])).rows[0].count).toBe(1)
  // Replaying the same scheduled time after the round cannot draw again (deterministic request id).
  await finishRound(id)
  await call(friend,'select public.lp_ready($1,true) result',[id])
  await db.query('update public.lp_rooms set scheduled_at=$2 where id=$1',[id,dueAt])
  const replay=await snap(watcher,id)
  expect(replay).toMatchObject({roundNo:1,scheduledAt:null})
  expect((await balances(id))[friend]).toBe(2500)
  // Internal helpers are not callable as RPCs.
  await db.exec('set role authenticated')
  for(const sql of ['select public.lp_draw($1,$1)','select public.lp_fire_schedule($1,now())','select public.lp_wake($1,$2)']) {
   await expect(db.query(sql,sql.includes('$2')?[id,'{}']:[id])).rejects.toThrow('permission denied')
  }
  await db.exec('reset role')
 },30000)

 test('nobody ready clears the schedule and tells why; sold-out rolls back the whole draw', async()=>{
  const id=await openRoom()
  await call(host,'select public.lp_schedule($1,1) result',[id])
  await due(id)
  const empty=await snap(friend,id)
  expect(empty).toMatchObject({roundNo:0,scheduledAt:null,lastSchedule:{status:'nobody-ready',roundNo:null}})
  expect((await snap(host,id)).lastSchedule.status).toBe('nobody-ready')

  await call(host,'select public.lp_set_pitch_mode($1,true) result',[id])
  await call(host,'select public.lp_ready($1,true) result',[id])
  await call(friend,'select public.lp_ready($1,true) result',[id])
  await db.query("update public.lp_stock set remaining=case prize when 'plush' then 1 else 0 end where room=$1",[id])
  expect((await call(host,'select public.lp_schedule($1,1) result',[id])).lastSchedule).toBeNull()
  await due(id)
  const short=await snap(watcher,id)
  expect(short).toMatchObject({roundNo:0,scheduledAt:null,lastSchedule:{status:'sold-out',roundNo:null}})
  expect(short.stock).toEqual([{prize:'badge',remaining:0},{prize:'plush',remaining:1},{prize:'pouch',remaining:0}])
  expect(await balances(id)).toEqual({[host]:3000,[friend]:3000,[watcher]:3000})
  expect(short.members.filter(member=>member.ready)).toHaveLength(2)
  expect((await db.query('select count(*)::int count from public.lp_rounds where room=$1',[id])).rows[0].count).toBe(0)
 },30000)

 test('every locking RPC fires an overdue schedule first, so a late change or cancel cannot drop it', async()=>{
  // Cancel after the time: the schedule has already fired; nothing is cancelled.
  const a=await openRoom()
  await call(friend,'select public.lp_ready($1,true) result',[a])
  await call(host,'select public.lp_schedule($1,1) result',[a])
  await due(a)
  const cancelled=await call(host,'select public.lp_schedule($1,null) result',[a])
  expect(cancelled).toMatchObject({roundNo:1,scheduledAt:null,lastSchedule:{status:'started',roundNo:1}})

  // Re-schedule after the time: the fired round makes the change round-active; the whole call rolls back
  // and the next snapshot starts the original schedule.
  const b=await openRoom()
  await call(friend,'select public.lp_ready($1,true) result',[b])
  await call(host,'select public.lp_schedule($1,1) result',[b])
  await due(b)
  await expect(call(host,'select public.lp_schedule($1,3) result',[b])).rejects.toThrow('round-active')
  await expect(call(host,'select public.lp_start($1,$2,0) result',[b,randomUUID()])).rejects.toThrow('stale-round')
  await expect(call(friend,'select public.lp_ready($1,false) result',[b])).rejects.toThrow('round-active')
  expect(await snap(watcher,b)).toMatchObject({roundNo:1,scheduledAt:null,lastSchedule:{status:'started'}})
  expect((await balances(b))[friend]).toBe(2500)

  // Pitch mode switched on after the time applies from the next round, not the overdue one.
  const c=await openRoom()
  await call(friend,'select public.lp_ready($1,true) result',[c])
  await call(host,'select public.lp_schedule($1,1) result',[c])
  await due(c)
  const toggled=await call(host,'select public.lp_set_pitch_mode($1,true) result',[c])
  expect(toggled).toMatchObject({roundNo:1,pitchMode:true})
  expect(toggled.round.guaranteed).toBe(false)

  // Leaving after the time: the ready member was already in the scheduled round.
  const d=await openRoom()
  await call(friend,'select public.lp_ready($1,true) result',[d])
  await call(host,'select public.lp_schedule($1,1) result',[d])
  await due(d)
  await call(friend,'select public.lp_leave($1)',[d])
  const left=await snap(watcher,d)
  expect(left.roundNo).toBe(1)
  expect((await balances(d))[friend]).toBe(2500)
 },30000)

 test('pitch mode guarantees one real top prize while stock lasts and says so to everyone', async()=>{
  const id=await openRoom()
  await expect(call(friend,'select public.lp_set_pitch_mode($1,true) result',[id])).rejects.toThrow('host-required')
  await expect(call(host,'select public.lp_set_pitch_mode($1,null) result',[id])).rejects.toThrow('invalid-request')
  expect((await call(host,'select public.lp_set_pitch_mode($1,true) result',[id])).pitchMode).toBe(true)
  expect((await snap(watcher,id)).pitchMode).toBe(true)
  // One top prize left and no other chance of drawing it: exactly one entrant gets it.
  await db.query("update public.lp_stock set remaining=case prize when 'plush' then 1 else 50 end where room=$1",[id])
  for(const user of [host,friend,watcher]) await call(user,'select public.lp_ready($1,true) result',[id])
  const first=await call(host,'select public.lp_start($1,$2,0) result',[id,randomUUID()])
  expect(first.round).toMatchObject({guaranteed:true,results:null})
  expect((await snap(friend,id)).round.guaranteed).toBe(true)
  await finishRound(id)
  const shown=await snap(watcher,id)
  expect(shown.round.results.filter(result=>result.prize==='plush')).toHaveLength(1)
  expect(shown.stock.find(item=>item.prize==='plush').remaining).toBe(0)

  // No top prize left: draw normally and mark the round as not guaranteed (auto start honours the mode too).
  for(const user of [host,friend]) await call(user,'select public.lp_ready($1,true) result',[id])
  await call(host,'select public.lp_schedule($1,1) result',[id])
  await due(id)
  const second=await snap(watcher,id)
  expect(second).toMatchObject({roundNo:2,pitchMode:true,lastSchedule:{status:'started',roundNo:2}})
  expect(second.round.guaranteed).toBe(false)
  await finishRound(id)
  expect((await snap(host,id)).round.results.every(result=>result.prize!=='plush')).toBe(true)

  // Plenty of stock: every guaranteed round has at least one top prize.
  await db.query("update public.lp_stock set remaining=30 where room=$1",[id])
  for(let round=3;round<=6;round++) {
   for(const user of [host,friend,watcher]) await call(user,'select public.lp_ready($1,true) result',[id])
   await call(host,'select public.lp_start($1,$2,$3) result',[id,randomUUID(),round-1])
   await finishRound(id)
   const view=await snap(friend,id)
   expect(view.round.guaranteed).toBe(true)
   expect(view.round.results.filter(result=>result.prize==='plush').length).toBeGreaterThanOrEqual(1)
  }
  expect((await call(host,'select public.lp_set_pitch_mode($1,false) result',[id])).pitchMode).toBe(false)
 },30000)
})

describe('F10: owner-only host key and unique names', () => {
 const create=(user,id,name,key=KEY)=>call(user,'select public.lp_create($1,$2,$3) result',[id,key,name])
 const join=(user,invite,name)=>call(user,'select public.lp_join($1,$2) result',[invite,name])
 const resume=(user,key,id=null)=>call(user,'select public.lp_resume_host($1,$2) result',[key,id])
 const rename=(user,id,name)=>call(user,'select public.lp_rename($1,$2) result',[id,name])
 const snap=(user,id)=>call(user,'select public.lp_snapshot($1) result',[id])
 const failure=async pending=>{
  try { await pending } catch(error) { return { message:error.message, hint:error.hint ?? null } }
  throw new Error('expected a failure')
 }
 const rooms=async()=>(await db.query('select count(*)::int count from public.lp_rooms')).rows[0].count

 test('only a salted hash is stored and neither participants nor anon can read keys or attempts', async()=>{
  const rows=(await db.query("select encode(salt,'hex') salt,encode(hash,'hex') hash,row_to_json(k)::text raw from public.lp_host_keys k")).rows
  expect(rows).toHaveLength(1)
  expect(rows[0].raw).not.toContain(KEY)
  expect(hostKeyRecord(KEY,Buffer.from(rows[0].salt,'hex')).hash).toBe(rows[0].hash)
  for(const role of ['authenticated','anon']) {
   await db.exec(`set role ${role}`)
   for(const sql of ['select * from public.lp_host_keys','select * from public.lp_host_attempts','select public.lp_host_key_check($1)','select public.lp_auto_name($1::uuid)']) {
    await expect(db.query(sql,sql.includes('$1')?[sql.includes('uuid')?room:KEY]:[])).rejects.toThrow('permission denied')
   }
   await db.exec('reset role')
  }
  await db.exec('set role anon')
  await expect(db.query('select public.lp_create($1,$2,$3)',[randomUUID(),KEY,'ホスト'])).rejects.toThrow('permission denied')
  await expect(db.query('select public.lp_resume_host($1,null)',[KEY])).rejects.toThrow('permission denied')
  await expect(db.query('select public.lp_rename($1,$2)',[room,'名前'])).rejects.toThrow('permission denied')
  await db.exec('reset role')
 })

 test('a wrong, revoked or expired key cannot create a room; failures are limited per user', async()=>{
  const before=await rooms()
  const guest=randomUUID()
  expect(await create(guest,randomUUID(),'ゲスト',createHostKey())).toEqual({error:'host-key-invalid'})
  expect(await create(guest,randomUUID(),'ゲスト','short')).toEqual({error:'host-key-invalid'})
  expect(await create(guest,randomUUID(),null,null)).toEqual({error:'host-key-invalid'})
  expect(await resume(guest,createHostKey())).toEqual({error:'host-key-invalid'})
  expect(await create(guest,randomUUID(),'ゲスト',KEY.slice(0,-1)+(KEY.endsWith('A')?'B':'A'))).toEqual({error:'host-key-invalid'})
  expect((await db.query('select count(*)::int count from public.lp_host_attempts where user_id=$1',[guest])).rows[0].count).toBe(5)
  // Five failures in a minute: even the right key is refused until the minute passes.
  expect(await create(guest,randomUUID(),'ゲスト',KEY)).toEqual({error:'too-many-attempts'})
  expect(await resume(guest,KEY)).toEqual({error:'too-many-attempts'})
  expect(await rooms()).toBe(before)
  // Another user is not affected.
  const owner=randomUUID()
  expect((await create(owner,randomUUID(),'オーナー')).host).toBe(owner)
  await db.query("update public.lp_host_attempts set at=now()-interval '2 minutes' where user_id=$1",[guest])
  expect((await create(guest,randomUUID(),'ゲスト')).host).toBe(guest)
  // Attempts older than an hour are purged.
  await db.query("update public.lp_host_attempts set at=now()-interval '2 hours' where user_id=$1",[guest])
  expect(await create(owner,randomUUID(),'オーナー',createHostKey())).toEqual({error:'host-key-invalid'})
  expect((await db.query('select count(*)::int count from public.lp_host_attempts where user_id=$1',[guest])).rows[0].count).toBe(0)
  // Revoked and expired keys are invalid.
  const other=createHostKey()
  const inserted=(await db.query(hostKeySql('expired',hostKeyRecord(other)))).rows[0].id
  await db.query("update public.lp_host_keys set expires_at=now()-interval '1 second' where id=$1",[inserted])
  expect(await create(randomUUID(),randomUUID(),'期限切れ',other)).toEqual({error:'host-key-invalid'})
  await db.query("update public.lp_host_keys set expires_at=null,revoked_at=now() where id=$1",[inserted])
  expect(await create(randomUUID(),randomUUID(),'取り消し',other)).toEqual({error:'host-key-invalid'})
  await db.query("update public.lp_host_keys set revoked_at=null where id=$1",[inserted])
  expect((await create(randomUUID(),randomUUID(),'新しいキー',other)).pitchMode).toBe(false)
  await db.query("update public.lp_host_keys set revoked_at=now() where id=$1",[inserted])
  // A room is resumed only with the key that created it.
  await expect(resume(owner,other)).resolves.toEqual({error:'host-key-invalid'})
 },30000)

 test('participants cannot take over as host any more', async()=>{
  const [owner,friend]=[randomUUID(),randomUUID()]
  const id=randomUUID()
  const created=await create(owner,id,'オーナー')
  await join(friend,created.invite,'友だち')
  await db.query("update public.lp_members set seen_at=now()-interval '10 minutes' where room=$1 and user_id=$2",[id,owner])
  await expect(call(friend,'select public.lp_claim_host($1) result',[id])).rejects.toThrow('does not exist')
  await expect(call(friend,'select public.lp_create($1,$2) result',[randomUUID(),'友だち'])).rejects.toThrow('does not exist')
  expect(await resume(friend,createHostKey(),id)).toEqual({error:'host-key-invalid'})
  await expect(call(friend,'select public.lp_start($1,$2,0) result',[id,randomUUID()])).rejects.toThrow('host-required')
  const view=await snap(friend,id)
  expect(view.host).toBe(owner)
  expect(view.members.find(member=>member.id===owner).online).toBe(false)
 })

 test('the owner resumes as host on a new device and keeps every seat, coin and result', async()=>{
  const [laptop,phone,friend,watcher]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const created=await create(laptop,id,'オーナー')
  await join(friend,created.invite,'友だち')
  await join(watcher,created.invite,'見守り')
  for(const user of [laptop,friend]) await call(user,'select public.lp_ready($1,true) result',[id])
  await call(laptop,'select public.lp_start($1,$2,0) result',[id,randomUUID()])
  await db.query("update public.lp_rounds set starts_at=now()-interval '30 seconds',next_ready_at=now()-interval '15 seconds' where room=$1",[id])
  const before=await snap(laptop,id)
  expect(before.myResults).toHaveLength(1)
  const friendBefore=await snap(friend,id)
  await call(laptop,'select public.lp_schedule($1,5) result',[id])

  const resumed=await resume(phone,KEY)
  expect(resumed).toMatchObject({id,host:phone,self:phone,balance:2500,myResults:before.myResults})
  expect(resumed.scheduledAt).not.toBeNull()
  expect(resumed.members.map(member=>member.nickname)).toEqual(['オーナー','友だち','見守り'])
  expect(resumed.members.find(member=>member.nickname==='オーナー').id).toBe(phone)
  expect(resumed.round.results.find(result=>result.nickname==='オーナー').userId).toBe(phone)
  expect(resumed.round.results.some(result=>result.userId===laptop)).toBe(false)
  expect(await snap(friend,id)).toMatchObject({balance:friendBefore.balance,myResults:friendBefore.myResults,host:phone})
  // The old device no longer holds the seat; the phone can host.
  await expect(snap(laptop,id)).rejects.toThrow('room-unavailable')
  expect((await call(phone,'select public.lp_set_pitch_mode($1,true) result',[id])).pitchMode).toBe(true)
  // Resuming again on the same device changes nothing; an unknown room id finds nothing.
  expect(await resume(phone,KEY,id)).toMatchObject({host:phone,balance:2500})
  await expect(resume(phone,KEY,randomUUID())).rejects.toThrow('no-room')

  // A device that already joined as a participant keeps its own seat; the old host seat is released.
  await join(laptop,created.invite,'ノートPC')
  const back=await resume(laptop,KEY,id)
  expect(back).toMatchObject({host:laptop,self:laptop,balance:3000})
  expect(back.members.map(member=>member.nickname)).toEqual(['友だち','見守り','ノートPC'])
  await expect(snap(phone,id)).rejects.toThrow('room-unavailable')
  // The released host seat comes back through resume on that device (its name is still free).
  expect((await resume(phone,KEY,id)).members.map(member=>member.nickname)).toEqual(['オーナー','友だち','見守り'])

  // No open room for this key.
  await db.query("update public.lp_rooms set expires_at=now()-interval '1 second' where host_key is not null")
  await expect(resume(phone,KEY)).rejects.toThrow('no-room')
 },30000)

 test('names are unique per room across width, case and spaces, with a suggestion', async()=>{
  const [owner,a,b,c,d]=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(owner,id,'もも')
  expect(await failure(join(a,invite,'もも'))).toEqual({message:'name-taken',hint:'もも2'})
  expect((await join(a,invite,' もも2 ')).members.map(member=>member.nickname)).toEqual(['もも','もも2'])
  expect(await failure(join(b,invite,'もも'))).toEqual({message:'name-taken',hint:'もも3'})
  expect(await failure(join(b,invite,'もも２'))).toEqual({message:'name-taken',hint:'もも3'})
  expect(await failure(join(b,invite,'も　も'))).toMatchObject({message:'name-taken'})
  await join(b,invite,'Momo')
  for(const name of ['momo','ＭＯＭＯ','ｍｏ ｍｏ']) expect((await failure(join(c,invite,name))).message).toBe('name-taken')
  expect((await failure(join(c,invite,'ｍｏｍｏ'))).hint).toBe('ｍｏｍｏ2')
  // Twelve characters stay twelve with the number.
  await join(c,invite,'あいうえおかきくけこさし')
  expect(await failure(join(d,invite,'あいうえおかきくけこさし'))).toEqual({message:'name-taken',hint:'あいうえおかきくけこさ2'})
  for(const name of ['','   ','１２３４５６７８９０１２３']) expect((await failure(join(d,invite,name))).message).toBe('invalid-name')
  // The same user may keep or re-case their own name.
  expect((await join(b,invite,'MOMO')).members.find(member=>member.id===b).nickname).toBe('MOMO')
  // Rename follows the same rule.
  expect(await failure(rename(b,id,'もも'))).toEqual({message:'name-taken',hint:'もも3'})
  expect((await failure(rename(b,id,' '))).message).toBe('invalid-name')
  expect((await rename(b,id,'すもも')).members.find(member=>member.id===b).nickname).toBe('すもも')
  await expect(rename(d,id,'部外者')).rejects.toThrow('room-unavailable')
  // Leaving frees a name; rejoining without a name keeps it only while it is still free.
  await call(a,'select public.lp_leave($1)',[id])
  expect((await join(d,invite,'もも2')).members.find(member=>member.id===d).nickname).toBe('もも2')
  expect((await join(a,invite,null)).members.find(member=>member.id===a).nickname).toMatch(/^ゲスト \S+\d+$/)
  await call(d,'select public.lp_leave($1)',[id])
  expect((await rename(a,id,'もも2')).members.find(member=>member.id===a).nickname).toBe('もも2')
  await call(a,'select public.lp_leave($1)',[id])
  expect((await join(a,invite,null)).members.find(member=>member.id===a).nickname).toBe('もも2')
 },30000)

 test('names reject control and invisible format characters and fold every Unicode space', async()=>{
  const cp=String.fromCodePoint
  const [owner,a]=[randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(owner,id,'もも')
  for(const code of [0x600,0x200b,0x202e,0xfeff,0x2060,0xe0001,0xad,0x85,0x2066,0x1d173]) {
   expect((await failure(join(a,invite,`ゆ${cp(code)}ず`))).message).toBe('invalid-name')
  }
  expect((await failure(join(a,invite,`も${cp(0xa0)}も`))).message).toBe('name-taken')
  expect((await join(a,invite,`${cp(0x3000)}ゆ${cp(0x2003)}${cp(0x9)}ず${cp(0xa0)}`)).members.find(member=>member.id===a).nickname).toBe('ゆ ず')
  expect((await rename(a,id,`ゆ${cp(0x2028)}ず`)).members.find(member=>member.id===a).nickname).toBe('ゆ ず')
 })

 test('the SQL forbidden set is exactly Unicode Cc and Cf, like the JS side', async()=>{
  const js=[]
  for(let code=1;code<=0x10ffff;code++) if((code<0xd800||code>0xdfff)&&/[\p{Cc}\p{Cf}]/u.test(String.fromCodePoint(code))) js.push(code)
  const sql=(await db.query("select coalesce(array_agg(cp order by cp),'{}') codes from generate_series(1,1114111) cp where (cp<55296 or cp>57343) and chr(cp) ~ public.lp_name_forbidden()")).rows[0].codes
  expect(sql).toEqual(js)
  for(const code of [0x600,0x200b,0x202e,0xfeff,0x2060,0xe0001]) expect(js).toContain(code)
 },120000)

 test('names cannot change while a round is active, including a scheduled one that just fired', async()=>{
  const [owner,friend,watcher]=[randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(owner,id,'オーナー')
  await join(friend,invite,'友だち')
  await join(watcher,invite,'見守り') // F13: two guests besides the host
  await call(friend,'select public.lp_ready($1,true) result',[id])
  await call(owner,'select public.lp_start($1,$2,0) result',[id,randomUUID()])
  for(const user of [owner,friend]) expect((await failure(rename(user,id,'新しい名前'))).message).toBe('rename-locked')
  await db.query("update public.lp_rounds set starts_at=now()-interval '30 seconds',next_ready_at=now()-interval '15 seconds' where room=$1",[id])
  const done=await snap(friend,id)
  expect(done.round.results.find(result=>result.userId===friend).nickname).toBe('友だち')
  expect((await rename(friend,id,'新しい名前')).members.find(member=>member.id===friend).nickname).toBe('新しい名前')
  // A due schedule fires first; the rename is then refused and rolled back with it, and the next snapshot starts it.
  await call(friend,'select public.lp_ready($1,true) result',[id])
  await call(owner,'select public.lp_schedule($1,1) result',[id])
  await db.query("update public.lp_rooms set scheduled_at=now()-interval '1 second' where id=$1",[id])
  expect((await failure(rename(friend,id,'予約中の名前'))).message).toBe('rename-locked')
  const started=await snap(owner,id)
  expect(started).toMatchObject({roundNo:2,lastSchedule:{status:'started'}})
  expect(started.members.find(member=>member.id===friend).nickname).toBe('新しい名前')
 },30000)

 test('a retry of a created room returns it even after the key is revoked or the user is limited', async()=>{
  const other=createHostKey()
  const inserted=(await db.query(hostKeySql('retry',hostKeyRecord(other)))).rows[0].id
  const owner=randomUUID()
  const id=randomUUID()
  const created=await create(owner,id,'オーナー',other)
  await db.query("update public.lp_host_keys set revoked_at=now() where id=$1",[inserted])
  expect(await create(owner,id,'オーナー',other)).toMatchObject({id,host:owner,invite:created.invite})
  for(let i=0;i<5;i++) await create(owner,randomUUID(),null,other)
  expect(await create(owner,randomUUID(),null,other)).toEqual({error:'too-many-attempts'})
  expect(await create(owner,id,null,null)).toMatchObject({id,host:owner})
  // Someone else's request id still needs a valid key and never returns their room.
  expect(await create(randomUUID(),id,null,createHostKey())).toEqual({error:'host-key-invalid'})
  await expect(create(randomUUID(),id,null,KEY)).rejects.toThrow('room-unavailable')
 })

 test('joining without a name gives unique friendly names, even in a full room', async()=>{
  const owner=randomUUID()
  const id=randomUUID()
  const {invite}=await create(owner,id,null)
  const names=[(await snap(owner,id)).members[0].nickname]
  for(let i=0;i<99;i++) {
   const user=randomUUID()
   const view=await join(user,invite,null)
   names.push(view.members.find(member=>member.id===user).nickname)
  }
  for(const name of names) {
   expect(name).toMatch(/^ゲスト (さくら|もも|いちご|りんご|みかん|ぶどう|ゆず|くるみ|あんず|すもも|れもん|めろん)\d{1,4}$/)
   expect([...name].length).toBeLessThanOrEqual(12)
  }
  expect(new Set(names).size).toBe(100)
  expect((await db.query('select count(distinct name_key)::int count from public.lp_members where room=$1 and active',[id])).rows[0].count).toBe(100)
 },60000)
})

describe('F13: a round needs at least 2 active guests besides the host', () => {
 const create=(user,id,name)=>call(user,'select public.lp_create($1,$2,$3) result',[id,KEY,name])
 const join=(user,invite,name)=>call(user,'select public.lp_join($1,$2) result',[invite,name])
 const ready=(user,id)=>call(user,'select public.lp_ready($1,true) result',[id])
 const start=(user,id,expected=0)=>call(user,'select public.lp_start($1,$2,$3) result',[id,randomUUID(),expected])
 const schedule=(user,id,minutes)=>call(user,'select public.lp_schedule($1,$2) result',[id,minutes])
 const snap=(user,id)=>call(user,'select public.lp_snapshot($1) result',[id])
 const due=id=>db.query("update public.lp_rooms set scheduled_at=now()-interval '1 second' where id=$1 and scheduled_at is not null",[id])
 const scheduledAt=async id=>(await db.query('select scheduled_at from public.lp_rooms where id=$1',[id])).rows[0].scheduled_at
 const rounds=async id=>(await db.query('select count(*)::int count from public.lp_rounds where room=$1',[id])).rows[0].count
 const balances=async id=>Object.fromEntries((await db.query('select user_id,balance from public.lp_members where room=$1',[id])).rows.map(row=>[row.user_id,row.balance]))

 test('starting now is refused with 0 or 1 guest, counts active seats (not presence) and changes nothing', async()=>{
  const [host,a,b]=[randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト')
  await ready(host,id)
  await expect(start(host,id)).rejects.toThrow('need-more-players')
  await join(a,invite,'あ')
  await ready(a,id)
  await expect(start(host,id)).rejects.toThrow('need-more-players')
  // The host check still comes first for a guest.
  await expect(start(a,id)).rejects.toThrow('host-required')
  // A guest who left does not count.
  await join(b,invite,'い')
  await call(b,'select public.lp_leave($1)',[id])
  await expect(start(host,id)).rejects.toThrow('need-more-players')
  expect(await balances(id)).toEqual({[host]:3000,[a]:3000,[b]:3000})
  expect(await rounds(id)).toBe(0)
  const lobby=await snap(host,id)
  expect(lobby).toMatchObject({roundNo:0})
  expect(lobby.members.filter(member=>member.ready)).toHaveLength(2)
  // Pitch mode follows the same rule.
  await call(host,'select public.lp_set_pitch_mode($1,true) result',[id])
  await expect(start(host,id)).rejects.toThrow('need-more-players')
  await call(host,'select public.lp_set_pitch_mode($1,false) result',[id])
  // Two active guests: the round starts. An offline guest still counts (a seat, not presence).
  await db.query("update public.lp_members set seen_at=now()-interval '10 minutes' where room=$1 and user_id=$2",[id,a])
  await join(b,invite,'い')
  const started=await start(host,id)
  expect(started).toMatchObject({roundNo:1,balance:2500})
  expect(await balances(id)).toEqual({[host]:2500,[a]:3000,[b]:3000})
  // During the round the active round still wins over the guest check.
  await call(b,'select public.lp_leave($1)',[id])
  await expect(start(host,id,1)).rejects.toThrow('round-active')
  // Internal helper, not an RPC.
  for(const role of ['authenticated','anon']) {
   await db.exec(`set role ${role}`)
   await expect(db.query('select public.lp_guest_count($1)',[id])).rejects.toThrow('permission denied')
   await db.exec('reset role')
  }
 },30000)

 test('a due schedule waits for the second guest and starts when that guest joins', async()=>{
  const [host,a,b]=[randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト')
  await join(a,invite,'あ')
  await ready(host,id)
  await ready(a,id)
  await schedule(host,id,1)
  await due(id)
  const at=await scheduledAt(id)
  // Every snapshot and locking RPC leaves the waiting schedule in place.
  for(const user of [a,host,a]) {
   const view=await snap(user,id)
   expect(view).toMatchObject({roundNo:0,lastSchedule:null})
   expect(Date.parse(view.scheduledAt)).toBe(at.getTime())
  }
  expect(Date.parse((await ready(a,id)).scheduledAt)).toBe(at.getTime())
  await expect(start(host,id)).rejects.toThrow('need-more-players')
  expect(await scheduledAt(id)).toEqual(at)
  expect(await rounds(id)).toBe(0)
  // The second guest joins: the start runs in that same call, with the joiner counted.
  const joined=await join(b,invite,'い')
  expect(joined).toMatchObject({roundNo:1,scheduledAt:null,lastSchedule:{status:'started',roundNo:1}})
  expect(Date.parse(joined.lastSchedule.scheduledAt)).toBe(at.getTime())
  expect(joined.round.results).toBeNull()
  // Entrants are the online ready members; the joiner was not ready yet.
  expect(await balances(id)).toEqual({[host]:2500,[a]:2500,[b]:3000})
  for(const user of [host,a,b]) expect((await snap(user,id)).roundNo).toBe(1)
  expect(await rounds(id)).toBe(1)
 },30000)

 test('a rejoining guest also releases a waiting schedule; pitch mode waits the same way', async()=>{
  const [host,a,b]=[randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト')
  await join(a,invite,'あ')
  await join(b,invite,'い')
  await call(host,'select public.lp_set_pitch_mode($1,true) result',[id])
  for(const user of [host,a]) await ready(user,id)
  await schedule(host,id,1)
  // A guest leaves before the time: the schedule waits.
  await call(b,'select public.lp_leave($1)',[id])
  await due(id)
  expect(await snap(host,id)).toMatchObject({roundNo:0,lastSchedule:null})
  expect(await scheduledAt(id)).not.toBeNull()
  const back=await join(b,invite,null)
  expect(back).toMatchObject({roundNo:1,pitchMode:true,scheduledAt:null,lastSchedule:{status:'started',roundNo:1}})
  expect(back.round.guaranteed).toBe(true)
 },30000)

 test('the host can still change or cancel a waiting schedule', async()=>{
  const [host,a]=[randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト')
  await join(a,invite,'あ')
  await schedule(host,id,1)
  await due(id)
  const before=Date.now()
  const changed=await schedule(host,id,3)
  expect(Date.parse(changed.scheduledAt)-before).toBeGreaterThan(170_000)
  expect(changed).toMatchObject({roundNo:0,lastSchedule:null})
  await due(id)
  const at=await scheduledAt(id)
  const cancelled=await schedule(host,id,null)
  expect(cancelled).toMatchObject({roundNo:0,scheduledAt:null,lastSchedule:{status:'cancelled',roundNo:null}})
  expect(Date.parse(cancelled.lastSchedule.scheduledAt)).toBe(at.getTime())
  expect(await rounds(id)).toBe(0)
 },30000)
})

describe('F15: private goods photos are readable only inside an open room', () => {
 const create=(user,id,name)=>call(user,'select public.lp_create($1,$2,$3) result',[id,KEY,name])
 const join=(user,invite,name)=>call(user,'select public.lp_join($1,$2) result',[invite,name])
 // What the Storage API does for a signed-in user: SELECT on storage.objects as authenticated with the JWT sub.
 const visible=async(user,role='authenticated')=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??''])
  await db.exec(`set role ${role}`)
  try{return (await db.query("select name from storage.objects where bucket_id='pitch-goods' order by name")).rows.map(row=>row.name)}
  finally{await db.exec('reset role')}
 }
 const as=async(user,role,sql)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??''])
  await db.exec(`set role ${role}`)
  try{return await db.query(sql)}finally{await db.exec('reset role')}
 }
 const photos=['goods/badge.jpg','goods/plush.jpg','goods/pouch.jpg']

 beforeAll(async()=>{
  // Dashboard uploads (service role) are simulated as the table owner. Another bucket must stay invisible.
  await db.exec("insert into storage.buckets(id,name,public) values('other','other',false)")
  for(const name of photos) await db.query("insert into storage.objects(bucket_id,name) values('pitch-goods',$1)",[name])
  await db.query("insert into storage.objects(bucket_id,name) values('other','secret.jpg')")
 })

 test('the bucket is private, JPEG only and at most 1 MiB', async()=>{
  const {rows}=await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='pitch-goods'")
  expect(rows).toEqual([{public:false,file_size_limit:1048576,allowed_mime_types:['image/jpeg']}])
 })

 test('members and the host of an open room read the photos; outsiders, anon, departed members and expired rooms do not', async()=>{
  const [host,guest,other,outsider]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト')
  expect(await visible(host)).toEqual(photos)
  expect(await visible(outsider)).toEqual([])
  expect(await visible(null)).toEqual([])
  expect(await visible(outsider,'anon')).toEqual([])
  await join(guest,invite,'ゆい')
  await join(other,invite,'さき')
  expect(await visible(guest)).toEqual(photos)
  // Leaving the room ends access; rejoining restores it.
  await call(other,'select public.lp_leave($1)',[id])
  expect(await visible(other)).toEqual([])
  await join(other,invite,'さき')
  expect(await visible(other)).toEqual(photos)
  // The host keeps access while hosting an open room even without an active seat.
  await call(host,'select public.lp_leave($1)',[id])
  expect(await visible(host)).toEqual(photos)
  // Expired rooms grant nothing.
  await db.query("update public.lp_rooms set expires_at=now()-interval '1 second' where id=$1",[id])
  for(const user of [host,guest,other]) expect(await visible(user)).toEqual([])
 })

 test('no one but the owner can write, and the helper is not callable by anon', async()=>{
  const [host,guest]=[randomUUID(),randomUUID()]
  const id=randomUUID()
  const {invite}=await create(host,id,'ホスト2')
  await join(guest,invite,'もも')
  for(const user of [host,guest]){
   await expect(as(user,'authenticated',"insert into storage.objects(bucket_id,name) values('pitch-goods','goods/new.jpg')")).rejects.toThrow('row-level security')
   expect((await as(user,'authenticated',"update storage.objects set name='goods/x.jpg' where bucket_id='pitch-goods'")).affectedRows).toBe(0)
   expect((await as(user,'authenticated',"delete from storage.objects where bucket_id='pitch-goods'")).affectedRows).toBe(0)
  }
  await expect(as(null,'anon',"insert into storage.objects(bucket_id,name) values('pitch-goods','goods/new.jpg')")).rejects.toThrow('row-level security')
  expect((await db.query("select count(*)::int count from storage.objects where bucket_id='pitch-goods'")).rows[0].count).toBe(3)
  expect((await as(guest,'authenticated','select public.lp_can_view_photos() ok')).rows[0].ok).toBe(true)
  await expect(as(null,'anon','select public.lp_can_view_photos()')).rejects.toThrow('permission denied')
  const {rows}=await db.query("select prosecdef,proconfig from pg_proc where proname='lp_can_view_photos'")
  expect(rows).toEqual([{prosecdef:true,proconfig:['search_path=""']}])
 })
})
