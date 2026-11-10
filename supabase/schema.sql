-- Incidents for Cortile: database schema
-- Run in the Supabase SQL editor. Embedding size 1024 = voyage-3.5-lite.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table buildings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  manager_name text not null,
  created_at timestamptz default now()
);

create table units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  flat_no text not null,
  floor int not null,
  unique (building_id, flat_no)
);

create table residents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  name text not null
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  title text not null,
  category text not null,
  status text not null default 'open' check (status in ('open','update_sent','resolved')),
  opened_at timestamptz not null default now(),
  first_update_at timestamptz,
  resolved_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  resident_id uuid not null references residents(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','triaged','untriaged')),
  category text,
  urgency text check (urgency in ('emergency','high','normal','low')),
  flat text,
  summary text,
  is_question boolean default false,
  triage_json jsonb,
  embedding vector(1024),
  incident_id uuid references incidents(id) on delete set null
);
create index on messages (building_id, created_at desc);
create index on messages (incident_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  title text not null,
  doc_type text not null
);

create table doc_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  section text not null,
  text text not null,
  embedding vector(1024)
);
create index on doc_chunks (building_id);

create table updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade, -- for single-question replies
  draft_text text not null,
  final_text text,
  citations jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','sent')),
  approved_by text,
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references updates(id) on delete cascade,
  resident_id uuid not null references residents(id) on delete cascade,
  delivered_at timestamptz default now(),
  unique (update_id, resident_id)
);

create table unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  topic text not null,             -- short normalised topic, e.g. "EV chargers"
  example_question text not null,
  asked_count int not null default 1,
  last_asked timestamptz default now(),
  unique (building_id, topic)
);

create table corrections (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  from_incident_id uuid references incidents(id) on delete set null,
  by_user text not null default 'Priya',
  at timestamptz default now()
);

create table ai_events (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references buildings(id) on delete cascade,
  step text not null,              -- triage | group_check | incident_title | draft | verify
  ref_id uuid,                     -- message or incident id
  input jsonb,
  output jsonb,
  ok boolean not null,
  created_at timestamptz default now()
);

-- Similar open messages in ONE building, same category, recent.
create or replace function match_open_messages(
  p_building_id uuid,
  p_category text,
  p_embedding vector(1024),
  p_since timestamptz,
  p_threshold float,
  p_limit int,
  p_exclude uuid
) returns table (id uuid, incident_id uuid, summary text, similarity float)
language sql stable as $$
  select m.id, m.incident_id, m.summary, 1 - (m.embedding <=> p_embedding) as similarity
  from messages m
  left join incidents i on i.id = m.incident_id
  where m.building_id = p_building_id
    and m.category = p_category
    and m.created_at >= p_since
    and m.id <> p_exclude
    and m.embedding is not null
    and (m.incident_id is null or i.status <> 'resolved')
    and 1 - (m.embedding <=> p_embedding) >= p_threshold
  order by m.embedding <=> p_embedding
  limit p_limit;
$$;

-- Document chunks for ONE building.
create or replace function match_doc_chunks(
  p_building_id uuid,
  p_embedding vector(1024),
  p_threshold float,
  p_limit int
) returns table (id uuid, document_id uuid, title text, section text, text text, similarity float)
language sql stable as $$
  select c.id, c.document_id, d.title, c.section, c.text, 1 - (c.embedding <=> p_embedding) as similarity
  from doc_chunks c
  join documents d on d.id = c.document_id
  where c.building_id = p_building_id
    and 1 - (c.embedding <=> p_embedding) >= p_threshold
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;

-- Realtime for the live inbox
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table incidents;
