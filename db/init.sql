CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- OAuth Identity
    github_id BIGINT UNIQUE NOT NULL,
    github_username VARCHAR(255) NOT NULL,
    github_email VARCHAR(320) NOT NULL,
    github_node_id VARCHAR(255),
    github_profile_url TEXT,
    avatar_url TEXT,

    -- User Information
    email VARCHAR(320),
    name VARCHAR(255),
    bio TEXT,

    -- Application-specific
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- OAuth Tokens (optional)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scope TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id
    ON users(github_id);

-- IRS Exempt Organizations Business Master File (EO BMF) extract
-- Source: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
-- Column widths sized from observed data (AK/CA/NY/TX, ~490k rows) with headroom.

create table if not exists eo_bmf (
    id                  bigserial primary key,
    ein                 varchar(9)  not null,               -- Employer Identification Number, zero-padded
    name                varchar(100) not null,
    ico                 varchar(50),                        -- "in care of" name
    street              varchar(50),
    city                varchar(40),
    state               char(2),
    zip                 varchar(10),
    group_exemption     varchar(4),
    subsection          varchar(2),
    affiliation         varchar(1),
    classification      varchar(9),
    ruling              varchar(6),                         -- YYYYMM
    deductibility       varchar(1),
    foundation          varchar(2),
    activity            varchar(9),
    organization        varchar(1),
    status              varchar(2),
    tax_period          varchar(6),                         -- YYYYMM, can be blank
    asset_cd            varchar(2),
    income_cd           varchar(2),
    filing_req_cd       varchar(2),
    pf_filing_req_cd    varchar(2),
    acct_pd             varchar(2),
    asset_amt           bigint,                             -- whole dollars
    income_amt          bigint,                             -- whole dollars, can be negative
    revenue_amt         bigint,                             -- whole dollars, can be negative
    ntee_cd             varchar(4),
    sort_name           varchar(50),
    source_file         varchar(20),                        -- e.g. eo_ca.csv, for traceability
    loaded_at           timestamptz not null default now(),

    constraint uq_eo_bmf_ein unique (ein)
);

create index if not exists idx_eo_bmf_state on eo_bmf (state);
create index if not exists idx_eo_bmf_zip on eo_bmf (zip);
