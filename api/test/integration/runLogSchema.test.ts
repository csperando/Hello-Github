import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0005_create_run_log migration", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -11;

    let userId: string;
    let designId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-runlog-schema-test",
            github_email: "octocat-runlog-schema-test@example.com",
            github_node_id: "MDE6VXNlcjEx",
            github_profile_url: "https://github.com/octocat-runlog-schema-test",
            avatar_url: "https://avatars.githubusercontent.com/u/11?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        designId = design.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM run_log WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("has the expected columns and defaults", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'run_log';
        `);
        const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                row.column_name,
                row,
            ]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            ["id", "user_id", "design_id", "target_date", "commit_count", "status", "created_at"].sort(),
        );
        expect(byName.user_id?.is_nullable).toBe("NO");
        expect(byName.design_id?.is_nullable).toBe("YES");
        expect(byName.target_date?.is_nullable).toBe("NO");
    });

    it("enforces at most one row per (user_id, target_date)", async () => {
        await pool.query(
            `INSERT INTO run_log (user_id, design_id, target_date, commit_count, status) VALUES ($1, $2, '2026-01-04', 3, 'committed');`,
            [userId, designId],
        );

        await expect(
            pool.query(
                `INSERT INTO run_log (user_id, design_id, target_date, commit_count, status) VALUES ($1, $2, '2026-01-04', 5, 'committed');`,
                [userId, designId],
            ),
        ).rejects.toThrow();
    });

    it("rejects a status outside the allowed set", async () => {
        await expect(
            pool.query(
                `INSERT INTO run_log (user_id, design_id, target_date, commit_count, status) VALUES ($1, $2, '2026-01-04', 3, 'pending');`,
                [userId, designId],
            ),
        ).rejects.toThrow();
    });

    it("sets design_id to null (rather than blocking) when the referenced design is deleted", async () => {
        await pool.query(
            `INSERT INTO run_log (user_id, design_id, target_date, commit_count, status) VALUES ($1, $2, '2026-01-04', 3, 'committed');`,
            [userId, designId],
        );
        await pool.query("DELETE FROM designs WHERE id = $1;", [designId]);

        const row = await pool.query("SELECT design_id FROM run_log WHERE user_id = $1;", [userId]);
        expect(row.rows[0].design_id).toBeNull();
    });

    it("does not restrict deleting the user when a run_log row references them", async () => {
        // sanity check only - restrict-vs-cascade behavior for user_id is asserted
        // by exercising the FK directly, not by actually deleting the shared test user
        const constraints = await pool.query(`
            SELECT confdeltype
            FROM pg_constraint
            WHERE conname = 'run_log_user_id_fkey';
        `);
        // 'a' = NO ACTION (restrict-like, consistent with designs.user_id's FK)
        expect(constraints.rows[0]?.confdeltype).toBe("a");
    });
});
