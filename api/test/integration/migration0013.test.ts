import fs from "fs";
import path from "path";

import pool from "../../config/db";

/**
 * Runs 0013 against the pre-0013 shape of the tables it touches, in a
 * throwaway schema - the real tables are already migrated, and real rows are
 * never touched.
 */
describe("migration 0013 - soft deletes and selection-owned paint jobs", () => {
    const SCHEMA = "_migration_0013_test";
    const sql = fs.readFileSync(
        path.join(process.cwd(), "data", "migrations", "0013_soft_delete_and_selection_paint_jobs.sql"),
        "utf-8",
    );

    async function withPre0013Schema<T>(seed: string, run: (client: any) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
            await client.query(`SET search_path TO ${SCHEMA}, public;`);
            // pre-0013 columns/constraints the migration reads or drops
            await client.query(`
                CREATE TABLE designs (id INT PRIMARY KEY, pattern INTEGER[] NOT NULL);
                CREATE TABLE design_selections (
                    id UUID PRIMARY KEY,
                    user_id INT NOT NULL,
                    design_id INT NOT NULL REFERENCES designs(id),
                    start_date DATE NOT NULL,
                    year INTEGER NOT NULL,
                    custom_range BOOLEAN NOT NULL DEFAULT FALSE
                );
                CREATE TABLE backfill_jobs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id INT NOT NULL,
                    design_id INT NOT NULL REFERENCES designs(id),
                    year INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'awaiting_issue',
                    issue_url TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT backfill_jobs_user_design_unique UNIQUE (user_id, design_id),
                    CONSTRAINT backfill_jobs_status_valid CHECK (status IN ('awaiting_issue', 'ready', 'painting', 'done', 'failed'))
                );
            `);
            await client.query(seed);
            return await run(client);
        } finally {
            await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; RESET search_path;`);
            client.release();
        }
    }

    const selectionA = "00000000-0000-0000-0000-00000000000a";
    const selectionB = "00000000-0000-0000-0000-00000000000b";
    const seed = `
        INSERT INTO designs VALUES (1, '{0,1,0,0,0,0,0}'), (2, '{1,1,0,0,0,0,0}');
        INSERT INTO design_selections VALUES
            ('${selectionA}', 10, 1, '2024-12-29', 2025, TRUE),
            ('${selectionB}', 20, 2, '2025-03-02', 2025, FALSE);
        INSERT INTO backfill_jobs (user_id, design_id, year, status, updated_at) VALUES
            (10, 1, 2025, 'done', '2026-01-01T00:00:00Z'),
            (20, 2, 2025, 'awaiting_issue', '2026-02-01T00:00:00Z');
    `;

    it("links each existing job to its selection and copies what it paints", async () => {
        const rows = await withPre0013Schema(seed, async (client) => {
            await client.query(sql);
            const result = await client.query(
                `SELECT selection_id, year, pattern, start_date, custom_range, status, completed_at
                 FROM backfill_jobs ORDER BY selection_id;`,
            );
            return result.rows;
        });

        expect(rows).toEqual([
            {
                selection_id: selectionA,
                year: 2025,
                pattern: [0, 1, 0, 0, 0, 0, 0],
                start_date: "2024-12-29",
                custom_range: true,
                status: "done",
                completed_at: new Date("2026-01-01T00:00:00Z"),
            },
            {
                selection_id: selectionB,
                year: 2025,
                pattern: [1, 1, 0, 0, 0, 0, 0],
                start_date: "2025-03-02",
                custom_range: false,
                status: "awaiting_issue",
                completed_at: null,
            },
        ]);
    });

    it("drops the old (user_id, design_id) link", async () => {
        const columns = await withPre0013Schema(seed, async (client) => {
            await client.query(sql);
            const result = await client.query(
                `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'backfill_jobs';`,
                [SCHEMA],
            );
            return result.rows.map((r: { column_name: string }) => r.column_name);
        });

        expect(columns).not.toContain("user_id");
        expect(columns).not.toContain("design_id");
    });

    it("stops with the ids of jobs whose selection no longer exists, rather than guessing", async () => {
        await withPre0013Schema(
            `${seed} INSERT INTO designs VALUES (3, '{0}'); INSERT INTO backfill_jobs (user_id, design_id, year) VALUES (30, 3, 2025);`,
            async (client) => {
                await expect(client.query(sql)).rejects.toThrow(/backfill_jobs with no matching design selection/);
            },
        );
    });
});
