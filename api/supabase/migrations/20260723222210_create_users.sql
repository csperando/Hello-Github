create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create table users (
    id uuid primary key default gen_random_uuid(),

    -- OAuth Identity
    github_id bigint not null,
    github_username varchar(255) not null,
    github_email varchar(320) not null,
    github_node_id varchar(255),
    github_profile_url text,
    avatar_url text,

    -- User Information
    email varchar(320),
    name varchar(255),
    bio text,

    -- Application-specific
    role varchar(50) not null default 'user',
    is_active boolean not null default true,

    -- OAuth Tokens (optional)
    access_token text,
    refresh_token text,
    token_expires_at timestamptz,
    scope text,

    -- Metadata
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_login_at timestamptz,

    constraint uq_users_github_id unique (github_id)
);

create trigger set_users_updated_at
    before update on users
    for each row
    execute function set_updated_at();
