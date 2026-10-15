-- Add stable external-source identity for Telegram Bridge and future trusted integrations.
-- Execute as database owner / migration administrator. Clients must not use service-role keys.

begin;

alter table transfer_genie.messages
  add column if not exists source_kind text,
  add column if not exists source_channel_id text,
  add column if not exists source_message_id text;

create unique index if not exists messages_external_source_idx
  on transfer_genie.messages (owner_id, space_id, source_kind, source_channel_id, source_message_id)
  where source_kind is not null
    and source_channel_id is not null
    and source_message_id is not null;

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
        source_message_id, marked, marked_tag_ids, marked_pinned, marked_due_date,
        revision, deleted_at, created_at, updated_at
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
        marked = excluded.marked, marked_tag_ids = excluded.marked_tag_ids,
        marked_pinned = excluded.marked_pinned, marked_due_date = excluded.marked_due_date,
        revision = excluded.revision, deleted_at = null, updated_at = now();
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

revoke all on function transfer_genie.message_apply(uuid,text,uuid,uuid,text,bigint,jsonb) from public, anon;
grant execute on function transfer_genie.message_apply(uuid,text,uuid,uuid,text,bigint,jsonb) to authenticated;
grant execute on function transfer_genie.message_apply(uuid,text,uuid,uuid,text,bigint,jsonb) to service_role;

insert into transfer_genie.schema_migrations(version)
values ('002_message_source_identity')
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
