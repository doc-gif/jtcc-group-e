-- Rerunnable post-initialization policy draft. Apply only after realtime.messages exists.
-- Never mark this step complete when Realtime is absent; authoritative polling still works.
do $$ begin
 if to_regclass('realtime.messages') is null then
  raise exception 'Realtime is not initialized; apply lp_receive_round after initialization';
 end if;
 if not exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='lp_receive_round') then
  execute 'create policy lp_receive_round on realtime.messages for select to authenticated using (extension=''broadcast'' and public.lp_can_receive(realtime.topic()))';
 end if;
end $$;