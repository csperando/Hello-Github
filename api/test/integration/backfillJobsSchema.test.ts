import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import { LOCKING_JOB_STATUSES } from "../../models/backfillJobs";
import { iGitHubUpsertInput } from "../../models/users";

describe("backfill_jobs schema (0011, reshaped by 0013)", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -107;

    let userId: string;
    let designId: string;
    let selectionId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-backfill-schema-test",
            github_email: "octocat-backfill-schema-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-backfill-schema-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwNw==",
            github_profile_url: "https://github.com/octocat-backfill-schema-test",
            avatar_url: "https://avatars.githubusercontent.com/u/107?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        designId = design.id;
        selectionId = (await selectionsRepo.create(userId, designId, { start_date: "2024-12-29", year: 2025 })).id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM backfill_jobs WHERE selection_id = $1;", [selectionId]);
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    afterAll(async () => {
        await pool.end();
    });

    const insert = (status: string) =>
        pool.query(
            `INSERT INTO backfill_jobs (selection_id, status, year, pattern, start_date, custom_range)
             VALUES ($1, $2, 2025, '{0,1,0,0,0,0,0}', '2024-12-29', FALSE) RETURNING id;`,
            [selectionId, status],
        );

    it("has the expected columns", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'backfill_jobs';
        `);
        const byName: Record<string, { is_nullable: string }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string }) => [row.column_name, row]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            [
                "id", "selection_id", "year", "status", "issue_url", "pattern", "start_date", "custom_range",
                "stripe_payment_intent_id", "completed_at", "created_at", "updated_at", "last_error",
            ].sort(),
        );
        for (const required of ["selection_id", "year", "status", "pattern", "start_date", "custom_range"]) {
            expect(byName[required]?.is_nullable).toBe("NO");
        }
        expect(byName.issue_url?.is_nullable).toBe("YES");
        expect(byName.completed_at?.is_nullable).toBe("YES");
    });

    it("belongs to a design selection - a job for a selection that doesn't exist is rejected", async () => {
        await expect(
            pool.query(
                `INSERT INTO backfill_jobs (selection_id, status, year, pattern, start_date, custom_range)
                 VALUES (gen_random_uuid(), 'pending_payment', 2025, '{0}', '2024-12-29', FALSE);`,
            ),
        ).rejects.toThrow(/foreign key/);
    });

    it("only accepts statuses defined in backfill_job_statuses", async () => {
        await expect(insert("bogus")).rejects.toThrow(/backfill_jobs_status_fk/);
    });

    it("defines every status the API knows about", async () => {
        const defined = await pool.query("SELECT code FROM backfill_job_statuses ORDER BY sort_order;");
        expect(defined.rows.map((r: { code: string }) => r.code)).toEqual([
            "pending_payment", "awaiting_issue", "ready", "painting", "done", "failed", "cancelled",
        ]);
    });

    // The partial unique index has to list the locking statuses literally -
    // it must agree with the definition table and the API's constant.
    it("locks on exactly the statuses marked locks_design - in the table, the index, and the API", async () => {
        const marked = await pool.query("SELECT code FROM backfill_job_statuses WHERE locks_design ORDER BY code;");
        const markedCodes = marked.rows.map((r: { code: string }) => r.code);
        expect([...LOCKING_JOB_STATUSES].sort()).toEqual(markedCodes);

        for (const code of markedCodes) {
            await pool.query("DELETE FROM backfill_jobs WHERE selection_id = $1;", [selectionId]);
            await insert(code);
            await expect(insert(code)).rejects.toThrow(/idx_backfill_jobs_one_locking_per_selection/);
        }

        const unmarked = await pool.query("SELECT code FROM backfill_job_statuses WHERE NOT locks_design;");
        for (const { code } of unmarked.rows) {
            await pool.query("DELETE FROM backfill_jobs WHERE selection_id = $1;", [selectionId]);
            await insert(code);
            await expect(insert(code)).resolves.toBeDefined();
        }
    });

    it("defines the paint statuses a selection can be in", async () => {
        const defined = await pool.query("SELECT code, label FROM design_paint_statuses ORDER BY sort_order;");
        expect(defined.rows.map((r: { code: string }) => r.code)).toEqual(["unpainted", "locked", "painted", "error"]);
        expect(defined.rows.every((r: { label: string }) => r.label.length > 0)).toBe(true);
    });
});
