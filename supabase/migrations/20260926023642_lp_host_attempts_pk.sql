-- F10 follow-up: give the failed-attempt log a primary key (performance advisor "No Primary Key").
alter table public.lp_host_attempts add column id bigint generated always as identity primary key;
