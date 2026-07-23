# Database schema management

This directory is the Supabase CLI project root (`supabase init` was run from `api/`). It is the
**single source of truth** for the Postgres schema. Do not make schema changes through the Supabase
dashboard — use it for inspection/debugging only. Every schema change is a new migration file in
`migrations/`, committed to git.

```
supabase/
  config.toml     # local dev config (API/DB ports, auth settings, etc.) — generated, rarely hand-edited
  migrations/     # every schema change, in order, timestamp-prefixed. Never edit an applied one.
  seed.sql        # repeatable dev/demo data, safe to re-run
  .gitignore      # ignores .branches/.temp (link state, local secrets) — not the migrations themselves
```

All commands below assume `cwd = api/` (where `supabase/` lives). The CLI is a devDependency, so
either run it via `npx supabase ...` or use the npm scripts in `api/package.json`:

| npm script    | underlying command       | what it does                                              |
|---------------|---------------------------|------------------------------------------------------------|
| `npm run db:new -- <name>` | `supabase migration new <name>` | Creates a new empty, timestamp-prefixed migration file |
| `npm run db:start`         | `supabase start`                | Boots a local Postgres + Supabase stack in Docker      |
| `npm run db:reset`         | `supabase db reset`             | Drops the local DB, reapplies all migrations + seed.sql from empty |
| `npm run db:diff`          | `supabase db diff`              | Diffs local DB schema against migration files (add `--linked` to diff against the remote instead) |
| `npm run db:push`          | `supabase db push`              | Applies any migrations not yet recorded as applied on the linked remote project |

`db:start`/`db:reset`/local `db:diff` all require Docker.

## Adding a new table or schema change

1. `npm run db:new -- add_something_descriptive` — creates
   `migrations/<timestamp>_add_something_descriptive.sql`.
2. Write plain SQL (see [Conventions](#conventions) below). No ORM, no ad-hoc dashboard edits.
3. `npm run db:start && npm run db:reset` — proves the whole migration history still applies
   cleanly to an empty database, which is the whole point of this setup.
4. Commit the migration file.
5. When ready to ship it to the real project: `npx supabase db push` (requires linking, see below).

Never edit a migration that's already been applied anywhere (local, staging, prod) — including to
"fix" it. Write a new migration instead. Migration files are an append-only log of what happened to
the schema, not a snapshot you're allowed to rewrite.

## Linking to the live Supabase project (one-time, per machine)

The CLI needs to know which remote project `db push`/`db diff --linked`/`migration repair` target.
This requires an interactive login, so it's a step you run yourself, not something scriptable here:

```
npx supabase login                        # opens a browser, stores an access token locally
npx supabase link --project-ref <ref>     # <ref> is in your dashboard URL: supabase.com/dashboard/project/<ref>
```

`link` will prompt for the database password (same value as `POSTGRES_PASSWORD` in `.env`).

## Migration history was backfilled, not created fresh

`users` and `eo_bmf` existed in the live database *before* this CLI setup — they were originally
created by hand-running loose `.sql` files. `20260723222210_create_users.sql` and
`20260723222211_create_eo_bmf.sql` are those same table definitions, now captured as proper
migrations (the users migration additionally adds a `set_updated_at()` trigger the original hand-run
SQL didn't have).

Because the tables already exist remotely, the CLI's remote tracking table
(`supabase_migrations.schema_migrations`) doesn't know about these two migrations yet. Running
`db push` as-is would try to `CREATE TABLE` something that already exists and fail. After linking,
reconcile history once with:

```
npx supabase db diff --linked                                              # confirm no drift first
npx supabase migration repair --status applied 20260723222210 20260723222211
npx supabase migration list                                                # sanity check: both sides match
```

`migration repair` only writes rows into the tracking table — it does not execute any SQL from the
migration files. Every migration created *after* this point is a normal one: write it, test it
locally with `db:reset`, then `db push` for real.

## Conventions

- **Tables**: `snake_case`, plural (`users`). Exception for external reference datasets named after
  their source format (`eo_bmf`, the IRS Exempt Organizations extract) — don't force an awkward plural.
- **Columns**: `snake_case`. Boolean columns prefixed `is_`/`has_`. Every table gets
  `created_at timestamptz not null default now()`; add `updated_at` (with the `set_updated_at()`
  trigger, see `create_users` migration) only on tables whose rows are actually mutated after
  insert — skip it on append-only ingest tables like `eo_bmf`.
- **Primary keys**: `uuid primary key default gen_random_uuid()` for application-owned tables;
  `bigserial` for high-volume bulk-loaded reference data where UUIDs add no value.
- **Constraints/indexes** — name them explicitly so `\d` output and error messages stay readable:
  - Foreign key: `fk_<table>_<referenced_table>`
  - Unique: `uq_<table>_<col[_col...]>`
  - Check: `ck_<table>_<rule>`
  - Index: `idx_<table>_<col[_col...]>`
  - Always index FK columns yourself — Postgres does not do this automatically.
- **Relationships**: use real foreign keys with an explicit `ON DELETE` policy (`CASCADE`/
  `RESTRICT`/`SET NULL`) — never enforce referential integrity in application code alone.
- **updated_at**: reuse the shared `set_updated_at()` trigger function (defined once, in the
  `create_users` migration) rather than redefining a trigger function per table.

## Row Level Security

`api/config/db.ts` connects as `POSTGRES_USER=postgres` (Supabase's superuser role), which
**bypasses RLS entirely** — so enabling it today has no effect on this Express app's own queries.
RLS only matters once something talks to Postgres as a non-superuser role (a browser client via
`supabase-js`, PostgREST, etc.). Still worth enabling per table as it's created
(`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with a default-deny policy), since Supabase's linter
flags public tables without it regardless of who's actually querying — just don't invest time in
fine-grained policies until there's a real non-superuser consumer.

## Seed data

`seed.sql` is dev/demo-only fixture data, applied by `db:reset`. It uses
`insert ... on conflict (github_id) do nothing` rather than `TRUNCATE`, so re-running it against a
local dev database never destroys other local work. Do not add bulk/reference data (e.g. `eo_bmf`
rows) here — that's loaded separately, not hand-authored fixtures.
