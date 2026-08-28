import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0008_create_users_contributions migration", () => {
    const usersRepo = UsersRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -12;

    let userId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-userscontrib-schema-test",
            github_email: "octocat-userscontrib-schema-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-userscontrib-schema-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEy",
            github_profile_url: "https://github.com/octocat-userscontrib-schema-test",
            avatar_url: "https://avatars.githubusercontent.com/u/12?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM users_contributions WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("has the expected columns and nullability", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users_contributions';
        `);
        const byName: Record<string, { is_nullable: string }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string }) => [row.column_name, row]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            [
                "user_id",
                "year",
                "q",
                "commit_counts",
                "max_level_2_contribution",
                "previous_year_q",
                "previous_year_commit_counts",
                "computed_at",
            ].sort(),
        );
        expect(byName.user_id?.is_nullable).toBe("NO");
        expect(byName.year?.is_nullable).toBe("NO");
        expect(byName.q?.is_nullable).toBe("YES");
        expect(byName.commit_counts?.is_nullable).toBe("YES");
    });

    it("enforces at most one row per user (user_id is the primary key)", async () => {
        await pool.query(
            `INSERT INTO users_contributions (user_id, year, q, commit_counts) VALUES ($1, 2026, 20, '{10,20,29,40}');`,
            [userId],
        );

        await expect(
            pool.query(
                `INSERT INTO users_contributions (user_id, year, q, commit_counts) VALUES ($1, 2026, 15, '{8,15,22,30}');`,
                [userId],
            ),
        ).rejects.toThrow();
    });

    it("rejects commit_counts or previous_year_commit_counts arrays that aren't exactly length 4", async () => {
        await expect(
            pool.query(
                `INSERT INTO users_contributions (user_id, year, commit_counts) VALUES ($1, 2026, '{10,20,30}');`,
                [userId],
            ),
        ).rejects.toThrow();

        await expect(
            pool.query(
                `INSERT INTO users_contributions (user_id, year, previous_year_commit_counts) VALUES ($1, 2026, '{10,20,30,40,50}');`,
                [userId],
            ),
        ).rejects.toThrow();
    });

    it("allows null q/commit_counts/previous_year fields (cold-start row)", async () => {
        const result = await pool.query(
            `INSERT INTO users_contributions (user_id, year) VALUES ($1, 2026) RETURNING *;`,
            [userId],
        );
        expect(result.rows[0].q).toBeNull();
        expect(result.rows[0].commit_counts).toBeNull();
        expect(result.rows[0].previous_year_q).toBeNull();
        expect(result.rows[0].previous_year_commit_counts).toBeNull();
    });

    it("deletes the row when the referenced user is deleted (ON DELETE CASCADE)", async () => {
        await pool.query(
            `INSERT INTO users_contributions (user_id, year, q, commit_counts) VALUES ($1, 2026, 20, '{10,20,29,40}');`,
            [userId],
        );

        await pool.query("DELETE FROM users WHERE id = $1;", [userId]);

        const row = await pool.query("SELECT * FROM users_contributions WHERE user_id = $1;", [userId]);
        expect(row.rows).toHaveLength(0);
    });
});
