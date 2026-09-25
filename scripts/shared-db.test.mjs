import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
let db
const users=Array.from({length:42},()=>randomUUID())
const room=randomUUID()
let invite
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
 await db.exec(await readFile('supabase/drafts/shared_opening.sql','utf8'))
},30000)
afterAll(async()=>{await db?.close()})
test('40 seats, idempotent joins, atomic shared results, reconnect, host failover and private authorization',async()=>{
 const first=await call(users[0],'select public.lp_create($1,$2) result',[room,'ホスト'])
 invite=first.invite
 await expect(call(users[0],'select public.lp_create($1,$2) result',[null,'再作成'])).rejects.toThrow('invalid-request')
 await expect(call(users[0],'select public.lp_join($1,$2) result',[null,'参加'])).rejects.toThrow('room-unavailable')
 const duplicate=await call(users[0],'select public.lp_create($1,$2) result',[room,'ホスト'])
 expect(duplicate.id).toBe(first.id)
 for(let i=1;i<40;i++) await call(users[i],'select public.lp_join($1,$2) result',[invite,`ゲスト${i}`])
 await expect(call(users[40],'select public.lp_join($1,$2) result',[invite,'満員'])).rejects.toThrow('room-full')
 const again=await call(users[39],'select public.lp_join($1,$2) result',[invite,'復帰'])
 expect(again.members).toHaveLength(40)
 for(let i=0;i<40;i++) await call(users[i],'select public.lp_ready($1,true) result',[room])
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
 for(let i=0;i<40;i++) views.push(await call(users[i],'select public.lp_snapshot($1) result',[room]))
 expect(views.every(v=>JSON.stringify(v.round)===JSON.stringify(views[0].round))).toBe(true)
 expect(views[0].round.results).toHaveLength(40)
 expect(views[0].myResults).toHaveLength(1)
 expect(views[0].stock.reduce((sum,s)=>sum+s.remaining,0)).toBe(60)
 expect((await db.query('select count(*)::int count from realtime.messages')).rows[0].count).toBe(1)
 await call(users[39],'select public.lp_leave($1) result',[room])
 const late=await call(users[40],'select public.lp_join($1,$2) result',[invite,'遅れて参加'])
 expect(late.round.results.some(r=>r.userId===users[40])).toBe(false)
 await call(users[40],'select public.lp_leave($1) result',[room])
 const back=await call(users[39],'select public.lp_join($1,$2) result',[invite,'復帰'])
 expect(back.balance).toBe(2500)
 await expect(call(users[1],'select public.lp_claim_host($1) result',[room])).rejects.toThrow('host-online')
 await db.query("update public.lp_members set seen_at=now()-interval '60 seconds' where user_id=$1",[users[0]])
 const claimed=await call(users[1],'select public.lp_claim_host($1) result',[room]);expect(claimed.host).toBe(users[1])
 expect(await call(users[1],'select public.lp_can_receive($1) result',[`lp:${room}`])).toBe(true)
 expect(await call(users[41],'select public.lp_can_receive($1) result',[`lp:${room}`])).toBe(false)
 await expect(call(users[41],'select public.lp_snapshot($1) result',[room])).rejects.toThrow('room-unavailable')
 await db.exec('set role authenticated')
 await expect(db.query('select * from public.lp_rounds')).rejects.toThrow('permission denied')
 await db.exec('reset role')
},30000)
test('transaction rolls back every coin and stock mutation when stock is insufficient',async()=>{
 for(let i=1;i<40;i++) await call(users[i],'select public.lp_ready($1,true) result',[room])
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
  await isolated.exec(await readFile('supabase/drafts/shared_opening.sql','utf8'))
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