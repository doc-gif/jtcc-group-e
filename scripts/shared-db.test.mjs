import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
let db
const users=Array.from({length:102},()=>randomUUID())
const room=randomUUID()
let invite
const migrations=['supabase/migrations/20260926000239_lp_shared_opening.sql','supabase/migrations/20260926000446_lp_is_member_internal.sql','supabase/migrations/20260926014051_lp_schedule_pitch.sql','supabase/migrations/20260926015853_lp_fire_due_first.sql']
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
 for(const file of migrations) await db.exec(await readFile(file,'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
test('100 seats, idempotent joins, atomic shared results, reconnect, host failover and private authorization',async()=>{
 const first=await call(users[0],'select public.lp_create($1,$2) result',[room,'ホスト'])
 invite=first.invite
 expect(first).toMatchObject({scheduledAt:null,pitchMode:false,lastSchedule:null})
 await expect(call(users[0],'select public.lp_create($1,$2) result',[null,'再作成'])).rejects.toThrow('invalid-request')
 await expect(call(users[0],'select public.lp_join($1,$2) result',[null,'参加'])).rejects.toThrow('room-unavailable')
 const duplicate=await call(users[0],'select public.lp_create($1,$2) result',[room,'ホスト'])
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
 await expect(call(users[1],'select public.lp_claim_host($1) result',[room])).rejects.toThrow('host-online')
 await db.query("update public.lp_members set seen_at=now()-interval '60 seconds' where user_id=$1",[users[0]])
 const claimed=await call(users[1],'select public.lp_claim_host($1) result',[room]);expect(claimed.host).toBe(users[1])
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
 await expect(call(users[1],'select public.lp_start($1,$2,1) result',[room,randomUUID()])).rejects.toThrow('sold-out')
 const state=await call(users[1],'select public.lp_snapshot($1) result',[room]);expect(state.balance).toBe(2500);expect(state.roundNo).toBe(1)
 await db.exec("update public.lp_rooms set expires_at=now()-interval '1 second'")
 await expect(call(users[1],'select public.lp_snapshot($1) result',[room])).rejects.toThrow('room-unavailable')
},30000)

test('optional notification failure does not roll back an authoritative round', async()=>{
 const freshRoom=randomUUID()
 await call(users[0],'select public.lp_create($1,$2) result',[freshRoom,'ホスト'])
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
  for(const file of migrations) await isolated.exec(await readFile(file,'utf8'))
  const owner=randomUUID()
  const id=randomUUID()
  await isolated.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
  const created=(await isolated.query('select public.lp_create($1,$2) result',[id,'ホスト'])).rows[0].result
  expect(created.id).toBe(id)
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
  const created=await call(host,'select public.lp_create($1,$2) result',[id,'ホスト'])
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
