-- Make explicit Space creation safely retryable without creating duplicate Spaces.
-- Execute as database owner / migration administrator. Clients must not use service-role keys.

begin;

create table if not exists transfer_genie.space_create_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  space_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id),
  unique (owner_id, space_id)
);

alter table transfer_genie.space_create_operations enable row level security;
revoke all on table transfer_genie.space_create_operations from public, anon, authenticated;
grant all on table transfer_genie.space_create_operations to service_role;

drop function if exists transfer_genie.space_upsert(uuid,text);
drop function if exists transfer_genie.space_upsert(uuid,uuid,text);

create function transfer_genie.space_upsert(
  p_operation_id uuid,
  p_space_id uuid,
  p_name text
)
returns transfer_genie.spaces
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
  v_space transfer_genie.spaces;
  v_existing transfer_genie.space_create_operations;
begin
  if p_operation_id is null then
    raise exception 'OPERATION_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'SPACE_NAME_REQUIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_user_id::text || ':create-space:' || p_operation_id::text, 0
  ));
  select * into v_existing
  from transfer_genie.space_create_operations
  where owner_id = v_user_id and operation_id = p_operation_id;

  if found then
    if v_existing.space_id <> p_space_id or v_existing.name <> btrim(p_name) then
      raise exception 'OPERATION_ID_PAYLOAD_MISMATCH' using errcode = '22023';
    end if;
    select * into v_space
    from transfer_genie.spaces
    where owner_id = v_user_id and id = v_existing.space_id;
    return v_space;
  end if;

  insert into transfer_genie.spaces (id, owner_id, name)
  values (p_space_id, v_user_id, btrim(p_name))
  on conflict (owner_id, id) do update
    set name = excluded.name, updated_at = now()
    where transfer_genie.spaces.owner_id = v_user_id
  returning * into v_space;

  if not found then
    raise exception 'SPACE_ID_OWNED_BY_ANOTHER_USER' using errcode = '42501';
  end if;

  insert into transfer_genie.space_cursors (space_id, owner_id)
  values (p_space_id, v_user_id)
  on conflict (owner_id, space_id) do nothing;

  insert into transfer_genie.space_create_operations
    (owner_id, operation_id, space_id, name)
  values (v_user_id, p_operation_id, p_space_id, btrim(p_name));

  return v_space;
end;
$function$;

revoke all on function transfer_genie.space_upsert(uuid,uuid,text) from public, anon;
grant execute on function transfer_genie.space_upsert(uuid,uuid,text) to authenticated;
grant execute on function transfer_genie.space_upsert(uuid,uuid,text) to service_role;

insert into transfer_genie.schema_migrations(version)
values ('003_space_create_idempotency')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
