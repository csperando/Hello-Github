import fs from "fs";
import os from "os";
import path from "path";

import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";

describe("runMigrations", () => {
    // sentinel prefix so cleanup never touches real migrations recorded by the app
    const VERSION_A = "9998_test_create_scratch_table.sql";
    const VERSION_B = "9999_test_alter_scratch_table.sql";

    let migrationsDir: string;

    beforeEach(() => {
        migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
        fs.writeFileSync(
            path.join(migrationsDir, VERSION_A),
            "CREATE TABLE IF NOT EXISTS _migration_test_scratch (id INT);",
        );
        fs.writeFileSync(
            path.join(migrationsDir, VERSION_B),
            "ALTER TABLE _migration_test_scratch ADD COLUMN IF NOT EXISTS label TEXT;",
        );
    });

    afterEach(async () => {
        fs.rmSync(migrationsDir, { recursive: true, force: true });
        await pool.query("DROP TABLE IF EXISTS _migration_test_scratch;");
        await pool.query("DELETE FROM schema_migrations WHERE version = ANY($1);", [[VERSION_A, VERSION_B]]);
    });

    it("applies pending migrations in filename order and records them", async () => {
        const applied = await runMigrations(migrationsDir);

        expect(applied).toEqual([VERSION_A, VERSION_B]);

        const columns = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = '_migration_test_scratch';`,
        );
        const columnNames = columns.rows.map((row: { column_name: string }) => row.column_name);
        expect(columnNames).toEqual(expect.arrayContaining(["id", "label"]));

        const recorded = await pool.query(
            "SELECT version FROM schema_migrations WHERE version = ANY($1) ORDER BY version;",
            [[VERSION_A, VERSION_B]],
        );
        expect(recorded.rows.map((row: { version: string }) => row.version)).toEqual([VERSION_A, VERSION_B]);
    });

    it("skips already-applied migrations on a second run", async () => {
        await runMigrations(migrationsDir);
        const secondRun = await runMigrations(migrationsDir);

        expect(secondRun).toEqual([]);
    });

    it("rolls back and stops on a failing migration, leaving later migrations unapplied", async () => {
        fs.writeFileSync(path.join(migrationsDir, VERSION_A), "NOT VALID SQL;");

        await expect(runMigrations(migrationsDir)).rejects.toThrow();

        const recorded = await pool.query(
            "SELECT version FROM schema_migrations WHERE version = ANY($1);",
            [[VERSION_A, VERSION_B]],
        );
        expect(recorded.rows).toEqual([]);
    });
});
