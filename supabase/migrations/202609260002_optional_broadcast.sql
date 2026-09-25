-- Apply after Supabase has initialized realtime.messages. Never create its internal schema yourself.
do $$ begin
 if to_regclass('realtime.messages') is not null then
  execute 'create policy lp_receive_round on realtime.messages for select to authenticated using (extension=''broadcast'' and public.lp_can_receive(realtime.topic()))';
 else
  raise notice 'Realtime is not initialized; authoritative polling remains available. Apply the receive policy after initialization.';
 end if;
end $$;
