begin;
create table if not exists transfer_genie.bot_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  kind text not null check(kind in ('directory','tasks','events','contexts')),
  id text not null check(id ~ '^[A-Za-z0-9_.-]{1,100}$'),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,space_id,kind,id),
  foreign key(owner_id,space_id) references transfer_genie.spaces(owner_id,id) on delete cascade
);
alter table transfer_genie.bot_records enable row level security;
drop policy if exists bot_records_owner on transfer_genie.bot_records;
create policy bot_records_owner on transfer_genie.bot_records for select to authenticated using(owner_id=auth.uid());
grant select on transfer_genie.bot_records to authenticated;
create or replace function transfer_genie.bot_record_put(p_space_id uuid,p_kind text,p_id text,p_payload jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,transfer_genie as $$
begin
 if auth.uid() is null or not exists(select 1 from transfer_genie.spaces where owner_id=auth.uid() and id=p_space_id) then raise exception 'space access denied'; end if;
 if octet_length(p_payload::text)>4194304 then raise exception 'record too large'; end if;
 -- Serialize writes for one identity before checking immutable content.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_space_id::text || ':' || p_kind || ':' || p_id, 0));
 if p_kind in ('tasks','events','contexts') and exists(select 1 from transfer_genie.bot_records where owner_id=auth.uid() and space_id=p_space_id and kind=p_kind and id=p_id and payload<>p_payload) then raise exception 'immutable record conflict'; end if;
 insert into transfer_genie.bot_records(owner_id,space_id,kind,id,payload) values(auth.uid(),p_space_id,p_kind,p_id,p_payload)
 on conflict(owner_id,space_id,kind,id) do update set payload=excluded.payload,updated_at=now();
end $$;
revoke all on function transfer_genie.bot_record_put(uuid,text,text,jsonb) from public,anon;
grant execute on function transfer_genie.bot_record_put(uuid,text,text,jsonb) to authenticated;
insert into transfer_genie.schema_migrations(version) values('004_bot_plugin_records') on conflict do nothing;
commit;
