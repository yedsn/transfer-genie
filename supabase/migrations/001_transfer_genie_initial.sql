-- Transfer Genie Supabase initial schema
-- Execute as database owner / migration administrator in the target Supabase project.
-- This file does not contain and must not be executed with a client service-role key.

begin;

create schema if not exists transfer_genie;

revoke all on schema transfer_genie from public;
revoke all on schema transfer_genie from anon;
grant usage on schema transfer_genie to authenticated, service_role;

create table if not exists transfer_genie.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists transfer_genie.spaces (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists spaces_owner_updated_idx
  on transfer_genie.spaces (owner_id, updated_at desc);

create table if not exists transfer_genie.space_cursors (
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  next_change_seq bigint not null default 1 check (next_change_seq > 0),
  primary key (owner_id, space_id),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade
);

create table if not exists transfer_genie.messages (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  sender text not null,
  timestamp_ms bigint not null,
  size bigint not null default 0 check (size >= 0),
  kind text not null check (kind in ('text', 'file')),
  original_name text not null,
  content text,
  format text not null default 'text',
  file_hash text,
  legacy_filename text,
  transcript_source text,
  source_audio_mime_type text,
  transcript_raw_text text,
  source_kind text,
  source_channel_id text,
  source_message_id text,
  marked boolean not null default false,
  marked_tag_ids text[] not null default '{}',
  marked_pinned boolean not null default false,
  marked_due_date date,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, space_id, id),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade
);

create index if not exists messages_space_time_idx
  on transfer_genie.messages (owner_id, space_id, timestamp_ms desc, id desc);
create index if not exists messages_space_revision_idx
  on transfer_genie.messages (owner_id, space_id, revision, id);
create index if not exists messages_space_deleted_idx
  on transfer_genie.messages (owner_id, space_id, deleted_at)
  where deleted_at is not null;
create unique index if not exists messages_legacy_filename_idx
  on transfer_genie.messages (owner_id, space_id, legacy_filename)
  where legacy_filename is not null;
create unique index if not exists messages_external_source_idx
  on transfer_genie.messages (owner_id, space_id, source_kind, source_channel_id, source_message_id)
  where source_kind is not null and source_channel_id is not null and source_message_id is not null;

create table if not exists transfer_genie.tags (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  name text not null,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, space_id, id),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade
);

create unique index if not exists tags_active_name_idx
  on transfer_genie.tags (owner_id, space_id, lower(name))
  where deleted_at is null;

create table if not exists transfer_genie.attachments (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  message_id uuid not null,
  original_name text not null,
  object_path text not null,
  preview_object_path text,
  mime_type text,
  size bigint not null default 0 check (size >= 0),
  sha256 text,
  upload_status text not null default 'uploaded'
    check (upload_status in ('pending', 'uploaded', 'failed')),
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, space_id, id),
  unique (owner_id, object_path),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade,
  foreign key (owner_id, space_id, message_id)
    references transfer_genie.messages(owner_id, space_id, id) on delete cascade
);

create index if not exists attachments_message_idx
  on transfer_genie.attachments (owner_id, space_id, message_id, deleted_at);

create table if not exists transfer_genie.applied_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  operation_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, space_id, operation_id),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade
);

create index if not exists applied_operations_space_created_idx
  on transfer_genie.applied_operations (owner_id, space_id, created_at);

create table if not exists transfer_genie.space_create_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  space_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id),
  unique (owner_id, space_id)
);

create table if not exists transfer_genie.change_log (
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  change_seq bigint not null check (change_seq > 0),
  entity_type text not null check (entity_type in ('message', 'tag', 'attachment')),
  entity_id text not null,
  change_type text not null check (change_type in ('upsert', 'delete')),
  revision bigint not null check (revision > 0),
  changed_at timestamptz not null default now(),
  primary key (owner_id, space_id, change_seq),
  foreign key (owner_id, space_id)
    references transfer_genie.spaces(owner_id, id) on delete cascade
);

create index if not exists change_log_pull_idx
  on transfer_genie.change_log (owner_id, space_id, change_seq);

alter table transfer_genie.spaces enable row level security;
alter table transfer_genie.space_cursors enable row level security;
alter table transfer_genie.messages enable row level security;
alter table transfer_genie.tags enable row level security;
alter table transfer_genie.attachments enable row level security;
alter table transfer_genie.applied_operations enable row level security;
alter table transfer_genie.space_create_operations enable row level security;
alter table transfer_genie.change_log enable row level security;

drop policy if exists spaces_owner_select on transfer_genie.spaces;
create policy spaces_owner_select on transfer_genie.spaces
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists space_cursors_owner_select on transfer_genie.space_cursors;
create policy space_cursors_owner_select on transfer_genie.space_cursors
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists messages_owner_select on transfer_genie.messages;
create policy messages_owner_select on transfer_genie.messages
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists tags_owner_select on transfer_genie.tags;
create policy tags_owner_select on transfer_genie.tags
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists attachments_owner_select on transfer_genie.attachments;
create policy attachments_owner_select on transfer_genie.attachments
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists applied_operations_owner_select on transfer_genie.applied_operations;
create policy applied_operations_owner_select on transfer_genie.applied_operations
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists change_log_owner_select on transfer_genie.change_log;
create policy change_log_owner_select on transfer_genie.change_log
  for select to authenticated using (owner_id = auth.uid());

revoke all on all tables in schema transfer_genie from public, anon, authenticated;
grant select on transfer_genie.spaces,
  transfer_genie.space_cursors,
  transfer_genie.messages,
  transfer_genie.tags,
  transfer_genie.attachments,
  transfer_genie.applied_operations,
  transfer_genie.change_log
to authenticated;
grant all on all tables in schema transfer_genie to service_role;

create or replace function transfer_genie.require_user()
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, auth
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return v_user_id;
end;
$function$;

create or replace function transfer_genie.cloud_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
begin
  return jsonb_build_object(
    'schemaVersion', '001_transfer_genie_initial',
    'userId', v_user_id,
    'bucket', 'transfer-genie-files',
    'realtimeTable', 'transfer_genie.change_log'
  );
end;
$function$;

create or replace function transfer_genie.assert_space_owner(
  p_owner_id uuid,
  p_space_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie
as $function$
begin
  if not exists (
    select 1 from transfer_genie.spaces
    where owner_id = p_owner_id and id = p_space_id
  ) then
    raise exception 'SPACE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
end;
$function$;

create or replace function transfer_genie.operation_result(
  p_owner_id uuid,
  p_space_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie
as $function$
declare
  v_hash text;
  v_result jsonb;
begin
  select payload_hash, result into v_hash, v_result
  from transfer_genie.applied_operations
  where owner_id = p_owner_id and space_id = p_space_id and operation_id = p_operation_id;

  if not found then
    return null;
  end if;
  if v_hash <> p_payload_hash then
    raise exception 'OPERATION_ID_PAYLOAD_MISMATCH' using errcode = '22023';
  end if;
  return v_result;
end;
$function$;

create or replace function transfer_genie.next_change_seq(
  p_owner_id uuid,
  p_space_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie
as $function$
declare
  v_seq bigint;
begin
  insert into transfer_genie.space_cursors (space_id, owner_id, next_change_seq)
  values (p_space_id, p_owner_id, 1)
  on conflict (owner_id, space_id) do nothing;

  select next_change_seq into v_seq
  from transfer_genie.space_cursors
  where owner_id = p_owner_id and space_id = p_space_id
  for update;

  if not found then
    raise exception 'SPACE_CURSOR_NOT_FOUND' using errcode = 'P0001';
  end if;

  update transfer_genie.space_cursors
  set next_change_seq = v_seq + 1
  where owner_id = p_owner_id and space_id = p_space_id;
  return v_seq;
end;
$function$;

create or replace function transfer_genie.record_change(
  p_owner_id uuid,
  p_space_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_change_type text,
  p_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie
as $function$
declare
  v_seq bigint;
begin
  v_seq := transfer_genie.next_change_seq(p_owner_id, p_space_id);
  insert into transfer_genie.change_log (
    owner_id, space_id, change_seq, entity_type, entity_id, change_type, revision
  ) values (
    p_owner_id, p_space_id, v_seq, p_entity_type, p_entity_id, p_change_type, p_revision
  );
  return v_seq;
end;
$function$;

drop function if exists transfer_genie.space_upsert(uuid,text);

create or replace function transfer_genie.space_upsert(
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

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':create-space:' || p_operation_id::text, 0));
  select * into v_existing from transfer_genie.space_create_operations
  where owner_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_existing.space_id <> p_space_id or v_existing.name <> btrim(p_name) then
      raise exception 'OPERATION_ID_PAYLOAD_MISMATCH' using errcode = '22023';
    end if;
    select * into v_space from transfer_genie.spaces
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
  insert into transfer_genie.space_create_operations (owner_id, operation_id, space_id, name)
  values (v_user_id, p_operation_id, p_space_id, btrim(p_name));
  return v_space;
end;
$function$;

create or replace function transfer_genie.message_apply(
  p_operation_id uuid,
  p_payload_hash text,
  p_space_id uuid,
  p_message_id uuid,
  p_action text,
  p_base_revision bigint,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
  v_existing transfer_genie.messages;
  v_source_existing transfer_genie.messages;
  v_result jsonb;
  v_revision bigint;
  v_seq bigint;
  v_tag_ids text[] := '{}';
begin
  if p_payload_hash is null or btrim(p_payload_hash) = '' then
    raise exception 'PAYLOAD_HASH_REQUIRED' using errcode = '22023';
  end if;
  if p_action not in ('upsert', 'delete') then
    raise exception 'INVALID_ACTION' using errcode = '22023';
  end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'INVALID_BASE_REVISION' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_space_id::text || ':' || p_operation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('space:' || v_user_id::text || ':' || p_space_id::text, 0));
  v_result := transfer_genie.operation_result(v_user_id, p_space_id, p_operation_id, p_payload_hash);
  if v_result is not null then return v_result; end if;
  perform transfer_genie.assert_space_owner(v_user_id, p_space_id);

  if p_action = 'upsert'
     and nullif(p_payload ->> 'sourceKind', '') is not null
     and nullif(p_payload ->> 'sourceChannelId', '') is not null
     and nullif(p_payload ->> 'sourceMessageId', '') is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'source:' || v_user_id::text || ':' || p_space_id::text || ':' ||
      nullif(p_payload ->> 'sourceKind', '') || ':' ||
      nullif(p_payload ->> 'sourceChannelId', '') || ':' ||
      nullif(p_payload ->> 'sourceMessageId', ''), 0));
    select * into v_source_existing from transfer_genie.messages
    where owner_id = v_user_id and space_id = p_space_id
      and source_kind = nullif(p_payload ->> 'sourceKind', '')
      and source_channel_id = nullif(p_payload ->> 'sourceChannelId', '')
      and source_message_id = nullif(p_payload ->> 'sourceMessageId', '')
    for update;

    if found and (v_source_existing.id <> p_message_id or p_base_revision = 0) then
      v_result := jsonb_build_object(
        'status', 'applied', 'entityType', 'message', 'entityId', v_source_existing.id,
        'revision', v_source_existing.revision, 'changeSeq', 0, 'idempotent', true
      );
      insert into transfer_genie.applied_operations
        (owner_id, space_id, operation_id, payload_hash, result)
      values (v_user_id, p_space_id, p_operation_id, p_payload_hash, v_result);
      return v_result;
    end if;
  end if;

  select * into v_existing from transfer_genie.messages
  where owner_id = v_user_id and space_id = p_space_id and id = p_message_id
  for update;

  if found and v_existing.revision <> p_base_revision then
    v_result := jsonb_build_object(
      'status', 'conflict', 'entityType', 'message', 'entityId', p_message_id,
      'remoteRevision', v_existing.revision, 'remote', to_jsonb(v_existing)
    );
  elsif not found and p_action = 'delete' then
    v_result := jsonb_build_object(
      'status', 'missing', 'entityType', 'message', 'entityId', p_message_id
    );
  elsif not found and p_base_revision <> 0 then
    v_result := jsonb_build_object(
      'status', 'conflict', 'entityType', 'message', 'entityId', p_message_id,
      'remoteRevision', null, 'remote', null
    );
  else
    if p_action = 'upsert' then
      if jsonb_typeof(coalesce(p_payload -> 'markedTagIds', '[]'::jsonb)) <> 'array' then
        raise exception 'MARKED_TAG_IDS_MUST_BE_ARRAY' using errcode = '22023';
      end if;
      select coalesce(array_agg(distinct value order by value), '{}') into v_tag_ids
      from jsonb_array_elements_text(coalesce(p_payload -> 'markedTagIds', '[]'::jsonb)) as item(value);
      if exists (
        select 1 from unnest(v_tag_ids) as wanted(tag_id)
        where not exists (
          select 1 from transfer_genie.tags t
          where t.owner_id=v_user_id and t.space_id=p_space_id
            and t.id=wanted.tag_id and t.deleted_at is null
        )
      ) then
        raise exception 'TAG_NOT_FOUND_OR_FORBIDDEN' using errcode='23503';
      end if;

      v_revision := coalesce(v_existing.revision, 0) + 1;
      insert into transfer_genie.messages (
        id, owner_id, space_id, sender, timestamp_ms, size, kind, original_name,
        content, format, file_hash, legacy_filename, transcript_source,
        source_audio_mime_type, transcript_raw_text, source_kind, source_channel_id,
        source_message_id, marked, marked_tag_ids,
        marked_pinned, marked_due_date, revision, deleted_at, created_at, updated_at
      ) values (
        p_message_id, v_user_id, p_space_id,
        p_payload ->> 'sender', (p_payload ->> 'timestampMs')::bigint,
        coalesce((p_payload ->> 'size')::bigint, 0), p_payload ->> 'kind',
        p_payload ->> 'originalName', p_payload ->> 'content',
        coalesce(nullif(p_payload ->> 'format', ''), 'text'), p_payload ->> 'fileHash',
        p_payload ->> 'legacyFilename', p_payload ->> 'transcriptSource',
        p_payload ->> 'sourceAudioMimeType', p_payload ->> 'transcriptRawText',
        nullif(p_payload ->> 'sourceKind', ''), nullif(p_payload ->> 'sourceChannelId', ''),
        nullif(p_payload ->> 'sourceMessageId', ''),
        coalesce((p_payload ->> 'marked')::boolean, false), v_tag_ids,
        coalesce((p_payload ->> 'markedPinned')::boolean, false),
        nullif(p_payload ->> 'markedDueDate', '')::date,
        v_revision, null, coalesce(v_existing.created_at, now()), now()
      )
      on conflict (owner_id, space_id, id) do update set
        sender = excluded.sender, timestamp_ms = excluded.timestamp_ms,
        size = excluded.size, kind = excluded.kind, original_name = excluded.original_name,
        content = excluded.content, format = excluded.format, file_hash = excluded.file_hash,
        legacy_filename = excluded.legacy_filename, transcript_source = excluded.transcript_source,
        source_audio_mime_type = excluded.source_audio_mime_type,
        transcript_raw_text = excluded.transcript_raw_text, source_kind = excluded.source_kind,
        source_channel_id = excluded.source_channel_id, source_message_id = excluded.source_message_id,
        marked = excluded.marked,
        marked_tag_ids = excluded.marked_tag_ids, marked_pinned = excluded.marked_pinned,
        marked_due_date = excluded.marked_due_date, revision = excluded.revision,
        deleted_at = null, updated_at = now();
      v_seq := transfer_genie.record_change(v_user_id, p_space_id, 'message', p_message_id::text, 'upsert', v_revision);
    else
      v_revision := v_existing.revision + 1;
      update transfer_genie.messages
      set revision = v_revision, deleted_at = now(), updated_at = now()
      where owner_id = v_user_id and space_id = p_space_id and id = p_message_id;
      v_seq := transfer_genie.record_change(v_user_id, p_space_id, 'message', p_message_id::text, 'delete', v_revision);
    end if;
    v_result := jsonb_build_object(
      'status', 'applied', 'entityType', 'message', 'entityId', p_message_id,
      'revision', v_revision, 'changeSeq', v_seq
    );
  end if;

  insert into transfer_genie.applied_operations
    (owner_id, space_id, operation_id, payload_hash, result)
  values (v_user_id, p_space_id, p_operation_id, p_payload_hash, v_result);
  return v_result;
end;
$function$;

create or replace function transfer_genie.tag_apply(
  p_operation_id uuid,
  p_payload_hash text,
  p_space_id uuid,
  p_tag_id text,
  p_action text,
  p_base_revision bigint,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
  v_existing transfer_genie.tags;
  v_result jsonb;
  v_revision bigint;
  v_seq bigint;
begin
  if p_payload_hash is null or btrim(p_payload_hash) = '' then raise exception 'PAYLOAD_HASH_REQUIRED' using errcode = '22023'; end if;
  if p_action not in ('upsert', 'delete') then raise exception 'INVALID_ACTION' using errcode = '22023'; end if;
  if p_base_revision is null or p_base_revision < 0 then raise exception 'INVALID_BASE_REVISION' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_space_id::text || ':' || p_operation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('space:' || v_user_id::text || ':' || p_space_id::text, 0));
  v_result := transfer_genie.operation_result(v_user_id, p_space_id, p_operation_id, p_payload_hash);
  if v_result is not null then return v_result; end if;
  perform transfer_genie.assert_space_owner(v_user_id, p_space_id);
  select * into v_existing from transfer_genie.tags
  where owner_id = v_user_id and space_id = p_space_id and id = p_tag_id for update;

  if found and v_existing.revision <> p_base_revision then
    v_result := jsonb_build_object('status','conflict','entityType','tag','entityId',p_tag_id,'remoteRevision',v_existing.revision,'remote',to_jsonb(v_existing));
  elsif not found and p_action = 'delete' then
    v_result := jsonb_build_object('status','missing','entityType','tag','entityId',p_tag_id);
  elsif not found and p_base_revision <> 0 then
    v_result := jsonb_build_object('status','conflict','entityType','tag','entityId',p_tag_id,'remoteRevision',null,'remote',null);
  else
    v_revision := coalesce(v_existing.revision, 0) + 1;
    if p_action = 'upsert' then
      if p_name is null or btrim(p_name) = '' then raise exception 'TAG_NAME_REQUIRED' using errcode = '22023'; end if;
      insert into transfer_genie.tags (id, owner_id, space_id, name, revision, deleted_at, created_at, updated_at)
      values (p_tag_id, v_user_id, p_space_id, btrim(p_name), v_revision, null, coalesce(v_existing.created_at, now()), now())
      on conflict (owner_id,space_id,id) do update set name=excluded.name, revision=excluded.revision, deleted_at=null, updated_at=now();
      v_seq := transfer_genie.record_change(v_user_id,p_space_id,'tag',p_tag_id,'upsert',v_revision);
    else
      update transfer_genie.tags set revision=v_revision, deleted_at=now(), updated_at=now()
      where owner_id=v_user_id and space_id=p_space_id and id=p_tag_id;
      v_seq := transfer_genie.record_change(v_user_id,p_space_id,'tag',p_tag_id,'delete',v_revision);
    end if;
    v_result := jsonb_build_object('status','applied','entityType','tag','entityId',p_tag_id,'revision',v_revision,'changeSeq',v_seq);
  end if;
  insert into transfer_genie.applied_operations (owner_id,space_id,operation_id,payload_hash,result)
  values (v_user_id,p_space_id,p_operation_id,p_payload_hash,v_result);
  return v_result;
end;
$function$;

create or replace function transfer_genie.attachment_apply(
  p_operation_id uuid,
  p_payload_hash text,
  p_space_id uuid,
  p_attachment_id uuid,
  p_action text,
  p_base_revision bigint,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
  v_existing transfer_genie.attachments;
  v_message_id uuid;
  v_object_path text;
  v_expected_prefix text;
  v_result jsonb;
  v_revision bigint;
  v_seq bigint;
begin
  if p_payload_hash is null or btrim(p_payload_hash) = '' then raise exception 'PAYLOAD_HASH_REQUIRED' using errcode = '22023'; end if;
  if p_action not in ('upsert', 'delete') then raise exception 'INVALID_ACTION' using errcode = '22023'; end if;
  if p_base_revision is null or p_base_revision < 0 then raise exception 'INVALID_BASE_REVISION' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_space_id::text || ':' || p_operation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('space:' || v_user_id::text || ':' || p_space_id::text, 0));
  v_result := transfer_genie.operation_result(v_user_id, p_space_id, p_operation_id, p_payload_hash);
  if v_result is not null then return v_result; end if;
  perform transfer_genie.assert_space_owner(v_user_id, p_space_id);
  select * into v_existing from transfer_genie.attachments
  where owner_id=v_user_id and space_id=p_space_id and id=p_attachment_id for update;

  if found and v_existing.revision <> p_base_revision then
    v_result := jsonb_build_object('status','conflict','entityType','attachment','entityId',p_attachment_id,'remoteRevision',v_existing.revision,'remote',to_jsonb(v_existing));
  elsif not found and p_action='delete' then
    v_result := jsonb_build_object('status','missing','entityType','attachment','entityId',p_attachment_id);
  elsif not found and p_base_revision <> 0 then
    v_result := jsonb_build_object('status','conflict','entityType','attachment','entityId',p_attachment_id,'remoteRevision',null,'remote',null);
  else
    v_revision := coalesce(v_existing.revision,0)+1;
    if p_action='upsert' then
      v_message_id := (p_payload->>'messageId')::uuid;
      v_object_path := p_payload->>'objectPath';
      v_expected_prefix := v_user_id::text || '/' || p_space_id::text || '/' || p_attachment_id::text || '/';
      if v_object_path is null or left(v_object_path,length(v_expected_prefix)) <> v_expected_prefix then
        raise exception 'INVALID_OBJECT_PATH' using errcode='22023';
      end if;
      if nullif(p_payload->>'previewObjectPath','') is not null
        and left(p_payload->>'previewObjectPath',length(v_expected_prefix)) <> v_expected_prefix then
        raise exception 'INVALID_PREVIEW_OBJECT_PATH' using errcode='22023';
      end if;
      if not exists (select 1 from transfer_genie.messages where owner_id=v_user_id and space_id=p_space_id and id=v_message_id and deleted_at is null) then
        raise exception 'MESSAGE_NOT_FOUND' using errcode='23503';
      end if;
      insert into transfer_genie.attachments (
        id,owner_id,space_id,message_id,original_name,object_path,preview_object_path,
        mime_type,size,sha256,upload_status,revision,deleted_at,created_at,updated_at
      ) values (
        p_attachment_id,v_user_id,p_space_id,v_message_id,p_payload->>'originalName',v_object_path,
        p_payload->>'previewObjectPath',p_payload->>'mimeType',coalesce((p_payload->>'size')::bigint,0),
        p_payload->>'sha256',coalesce(nullif(p_payload->>'uploadStatus',''),'uploaded'),v_revision,null,
        coalesce(v_existing.created_at,now()),now()
      ) on conflict (owner_id,space_id,id) do update set
        message_id=excluded.message_id,original_name=excluded.original_name,object_path=excluded.object_path,
        preview_object_path=excluded.preview_object_path,mime_type=excluded.mime_type,size=excluded.size,
        sha256=excluded.sha256,upload_status=excluded.upload_status,revision=excluded.revision,
        deleted_at=null,updated_at=now();
      v_seq := transfer_genie.record_change(v_user_id,p_space_id,'attachment',p_attachment_id::text,'upsert',v_revision);
    else
      update transfer_genie.attachments set revision=v_revision,deleted_at=now(),updated_at=now()
      where owner_id=v_user_id and space_id=p_space_id and id=p_attachment_id;
      v_seq := transfer_genie.record_change(v_user_id,p_space_id,'attachment',p_attachment_id::text,'delete',v_revision);
    end if;
    v_result := jsonb_build_object('status','applied','entityType','attachment','entityId',p_attachment_id,'revision',v_revision,'changeSeq',v_seq);
  end if;
  insert into transfer_genie.applied_operations (owner_id,space_id,operation_id,payload_hash,result)
  values (v_user_id,p_space_id,p_operation_id,p_payload_hash,v_result);
  return v_result;
end;
$function$;

create or replace function transfer_genie.pull_changes(
  p_space_id uuid,
  p_after_seq bigint default 0,
  p_limit integer default 500
)
returns table (
  change_seq bigint,
  entity_type text,
  entity_id text,
  change_type text,
  revision bigint,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, transfer_genie, auth
as $function$
declare
  v_user_id uuid := transfer_genie.require_user();
  v_limit integer := greatest(1, least(coalesce(p_limit,500),1000));
begin
  perform transfer_genie.assert_space_owner(v_user_id,p_space_id);
  return query
    select c.change_seq,c.entity_type,c.entity_id,c.change_type,c.revision,c.changed_at
    from transfer_genie.change_log c
    where c.owner_id=v_user_id and c.space_id=p_space_id and c.change_seq>greatest(coalesce(p_after_seq,0),0)
    order by c.change_seq asc
    limit v_limit;
end;
$function$;

revoke all on function transfer_genie.require_user() from public, anon, authenticated;
revoke all on function transfer_genie.assert_space_owner(uuid,uuid) from public, anon, authenticated;
revoke all on function transfer_genie.operation_result(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function transfer_genie.next_change_seq(uuid,uuid) from public, anon, authenticated;
revoke all on function transfer_genie.record_change(uuid,uuid,text,text,text,bigint) from public, anon, authenticated;

revoke all on function transfer_genie.space_upsert(uuid,uuid,text) from public, anon;
revoke all on function transfer_genie.cloud_status() from public, anon;
revoke all on function transfer_genie.message_apply(uuid,text,uuid,uuid,text,bigint,jsonb) from public, anon;
revoke all on function transfer_genie.tag_apply(uuid,text,uuid,text,text,bigint,text) from public, anon;
revoke all on function transfer_genie.attachment_apply(uuid,text,uuid,uuid,text,bigint,jsonb) from public, anon;
revoke all on function transfer_genie.pull_changes(uuid,bigint,integer) from public, anon;

grant execute on function transfer_genie.space_upsert(uuid,uuid,text) to authenticated;
grant execute on function transfer_genie.cloud_status() to authenticated;
grant execute on function transfer_genie.message_apply(uuid,text,uuid,uuid,text,bigint,jsonb) to authenticated;
grant execute on function transfer_genie.tag_apply(uuid,text,uuid,text,text,bigint,text) to authenticated;
grant execute on function transfer_genie.attachment_apply(uuid,text,uuid,uuid,text,bigint,jsonb) to authenticated;
grant execute on function transfer_genie.pull_changes(uuid,bigint,integer) to authenticated;

grant execute on all functions in schema transfer_genie to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('transfer-genie-files','transfer-genie-files',false,null)
on conflict (id) do update set public=false;

drop policy if exists transfer_genie_files_select on storage.objects;
create policy transfer_genie_files_select on storage.objects
for select to authenticated
using (
  bucket_id='transfer-genie-files'
  and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists (
    select 1 from transfer_genie.spaces s
    where s.owner_id=auth.uid()
      and s.id::text=(storage.foldername(storage.objects.name))[2]
  )
);

drop policy if exists transfer_genie_files_insert on storage.objects;
create policy transfer_genie_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='transfer-genie-files'
  and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists (
    select 1 from transfer_genie.spaces s
    where s.owner_id=auth.uid()
      and s.id::text=(storage.foldername(storage.objects.name))[2]
  )
);

drop policy if exists transfer_genie_files_update on storage.objects;
create policy transfer_genie_files_update on storage.objects
for update to authenticated
using (
  bucket_id='transfer-genie-files'
  and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists (
    select 1 from transfer_genie.spaces s
    where s.owner_id=auth.uid()
      and s.id::text=(storage.foldername(storage.objects.name))[2]
  )
)
with check (
  bucket_id='transfer-genie-files'
  and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists (
    select 1 from transfer_genie.spaces s
    where s.owner_id=auth.uid()
      and s.id::text=(storage.foldername(storage.objects.name))[2]
  )
);

drop policy if exists transfer_genie_files_delete on storage.objects;
create policy transfer_genie_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id='transfer-genie-files'
  and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists (
    select 1 from transfer_genie.spaces s
    where s.owner_id=auth.uid()
      and s.id::text=(storage.foldername(storage.objects.name))[2]
  )
);

do $block$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='transfer_genie'
      and tablename='change_log'
  ) then
    alter publication supabase_realtime add table transfer_genie.change_log;
  end if;
end;
$block$;

insert into transfer_genie.schema_migrations(version)
values ('001_transfer_genie_initial')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;

-- Post-deployment read-only checks:
-- select version, applied_at from transfer_genie.schema_migrations order by applied_at;
-- select schemaname, tablename from pg_publication_tables
--   where pubname='supabase_realtime' and schemaname='transfer_genie';
-- select id, public from storage.buckets where id='transfer-genie-files';

