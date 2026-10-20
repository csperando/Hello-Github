import fs from "fs";
import path from "path";

import pool from "../../config/db";

/**
 * Runs 0012's data conversion against the pre-0012 shape of the two tables it
 * touches, in a throwaway schema - the real tables are already migrated, and
 * real rows are never touched.
 */
describe("migration 0012 - design_selections.year + custom_range", () => {
    const SCHEMA = "_migration_0012_test";
    const sql = fs.readFileSync(
        path.join(process.cwd(), "data", "migrations", "0012_add_design_selection_year_and_custom_range.sql"),
        "utf-8",
    );

    async function migrate(rows: {
        selections: { id: number; start_date: string; recurrence_end_date?: string | null; repeat_indefinitely?: boolean }[];
        jobs?: { selection_id: number; year: number }[];
    }) {
        const client = await pool.connect();
        try {
            await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
            await client.query(`SET search_path TO ${SCHEMA};`);
            // pre-0012 columns the migration reads; user/design ids stand in as plain values
            await client.query(`
                CREATE TABLE design_selections (
                    id INT PRIMARY KEY,
                    user_id INT NOT NULL,
                    design_id INT NOT NULL,
                    start_date DATE NOT NULL,
                    repeat_indefinitely BOOLEAN NOT NULL DEFAULT FALSE,
                    recurrence_end_date DATE
                );
                CREATE TABLE backfill_jobs (user_id INT NOT NULL, design_id INT NOT NULL, year INT NOT NULL);
            `);
            for (const s of rows.selections) {
                await client.query(
                    `INSERT INTO design_selections VALUES ($1, $1, $1, $2, $3, $4);`,
                    [s.id, s.start_date, s.repeat_indefinitely ?? false, s.recurrence_end_date ?? null],
                );
            }
            for (const j of rows.jobs ?? []) {
                await client.query(`INSERT INTO backfill_jobs VALUES ($1, $1, $2);`, [j.selection_id, j.year]);
            }

            await client.query(sql);

            const result = await client.query(
                `SELECT id, year, custom_range, recurrence_end_date FROM design_selections ORDER BY id;`,
            );
            return result.rows;
        } finally {
            await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; RESET search_path;`);
            client.release();
        }
    }

    it("turns the editor's custom-range encoding (recurrence_end_date) into custom_range, clearing recurrence_end_date", async () => {
        const rows = await migrate({
            selections: [
                { id: 1, start_date: "2025-03-02", recurrence_end_date: "2025-12-31" }, // custom range
                { id: 2, start_date: "2025-03-02" }, // one-off
            ],
        });

        expect(rows).toEqual([
            { id: 1, year: 2025, custom_range: true, recurrence_end_date: null },
            { id: 2, year: 2025, custom_range: false, recurrence_end_date: null },
        ]);
    });

    it("takes year from the purchased backfill job when there is one", async () => {
        // Sun 2025-12-28 is shared by 2025's last column and 2026's first - the
        // job records which year was actually paid for
        const rows = await migrate({
            selections: [{ id: 1, start_date: "2025-12-28" }],
            jobs: [{ selection_id: 1, year: 2025 }],
        });

        expect(rows[0].year).toBe(2025);
    });

    it("falls back to the start_date + 6 days rule without a job", async () => {
        const rows = await migrate({
            selections: [
                { id: 1, start_date: "2024-12-29" }, // 2025's first column
                { id: 2, start_date: "2025-06-15" },
            ],
        });

        expect(rows.map((r: { year: number }) => r.year)).toEqual([2025, 2025]);
    });
});
