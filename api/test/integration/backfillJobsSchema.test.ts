import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0011_create_backfill_jobs migration", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -107;

    let userId: string;
    let designId: string;

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
    });

    afterEach(async () => {
        await pool.query("DELETE FROM backfill_jobs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    afterAll(async () => {
        await pool.end();
    });

    it("has the expected columns and defaults", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'backfill_jobs';
        `);
        const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                row.column_name,
                row,
            ]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            ["id", "user_id", "design_id", "year", "status", "issue_url", "created_at", "updated_at"].sort(),
        );
        expect(byName.user_id?.is_nullable).toBe("NO");
        expect(byName.design_id?.is_nullable).toBe("NO");
        expect(byName.year?.is_nullable).toBe("NO");
        expect(byName.status?.column_default).toMatch(/awaiting_issue/);
        expect(byName.issue_url?.is_nullable).toBe("YES");
    });

    it("rejects an unknown status", async () => {
        await expect(
            pool.query(
                "INSERT INTO backfill_jobs (user_id, design_id, year, status) VALUES ($1, $2, 2024, 'bogus');",
                [userId, designId],
            ),
        ).rejects.toThrow(/backfill_jobs_status_valid/);
    });

    it("allows only one job per user and design", async () => {
        const insert = "INSERT INTO backfill_jobs (user_id, design_id, year) VALUES ($1, $2, 2024);";
        await pool.query(insert, [userId, designId]);
        await expect(pool.query(insert, [userId, designId])).rejects.toThrow(/backfill_jobs_user_design_unique/);
    });
});
