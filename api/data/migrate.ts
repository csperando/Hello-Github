import fs from "fs";
import path from "path";
import pool from "../config/db";
import { logger } from "../config/logger";

// resolved from process.cwd() rather than __dirname: __dirname would point at
// dist/data once compiled, but tsc never copies the .sql files there - every
// entry point that runs this (npm scripts, ts-node-dev, jest, the Docker
// image's WORKDIR) has cwd set to the api/ project root, where data/migrations
// actually lives (and is COPY'd to in deploy/Dockerfile.api).
const DEFAULT_MIGRATIONS_DIR = path.join(process.cwd(), "data", "migrations");

async function ensureMigrationsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function getAppliedVersions(): Promise<Set<string>> {
    const result = await pool.query("SELECT version FROM schema_migrations;");
    return new Set(result.rows.map((row: { version: string }) => row.version));
}

function getMigrationFiles(migrationsDir: string): string[] {
    return fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();
}

async function applyMigration(migrationsDir: string, version: string): Promise<void> {
    const sql = fs.readFileSync(path.join(migrationsDir, version), "utf-8");
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1);", [version]);
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Applies any pending .sql migration in migrationsDir (filename order) not yet
 * recorded in schema_migrations. Returns the versions actually applied.
 */
export async function runMigrations(migrationsDir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
    await ensureMigrationsTable();
    const applied = await getAppliedVersions();
    const pending = getMigrationFiles(migrationsDir).filter((version) => !applied.has(version));

    for (const version of pending) {
        logger.info(`Applying migration [${version}]...`);
        await applyMigration(migrationsDir, version);
    }

    return pending;
}

if (require.main === module) {
    runMigrations()
        .then(async (applied) => {
            logger.info(`Applied ${applied.length} migration(s).`);
            await pool.end();
            process.exit(0);
        })
        .catch(async (err) => {
            logger.error(err);
            await pool.end();
            process.exit(1);
        });
}
