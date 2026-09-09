import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0009_create_user_billing migration", () => {
    const usersRepo = UsersRepository.repo();
    // fixed, out-of-range-for-real-GitHub ids so this test never collides with real data
    const testGitHubId = -13;
    const otherGitHubId = -14;

    let userId: string;
    let otherUserId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-userbilling-schema-test",
            github_email: "octocat-userbilling-schema-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-userbilling-schema-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEz",
            github_profile_url: "https://github.com/octocat-userbilling-schema-test",
            avatar_url: "https://avatars.githubusercontent.com/u/13?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const other = await usersRepo.upsertFromGitHub({
            github_id: otherGitHubId,
            github_username: "octocat-userbilling-schema-test-2",
            github_email: "octocat-userbilling-schema-test-2@example.com",
            github_noreply_email: `${otherGitHubId}+octocat-userbilling-schema-test-2@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjE0",
            github_profile_url: "https://github.com/octocat-userbilling-schema-test-2",
            avatar_url: "https://avatars.githubusercontent.com/u/14?v=4",
        } as iGitHubUpsertInput);
        otherUserId = other.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM user_billing WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [[testGitHubId, otherGitHubId]]);
    });

    it("has the expected columns, nullability, and defaults", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'user_billing';
        `);
        const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                row.column_name,
                row,
            ]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            [
                "user_id",
                "stripe_customer_id",
                "stripe_subscription_id",
                "subscription_status",
                "auto_renew",
                "paid_until",
                "created_at",
                "updated_at",
            ].sort(),
        );
        expect(byName.user_id?.is_nullable).toBe("NO");
        expect(byName.auto_renew?.is_nullable).toBe("NO");
        expect(byName.paid_until?.is_nullable).toBe("YES");
        expect(byName.stripe_customer_id?.is_nullable).toBe("YES");
        expect(byName.stripe_subscription_id?.is_nullable).toBe("YES");
        expect(byName.subscription_status?.is_nullable).toBe("YES");
    });

    it("defaults auto_renew to false and paid_until to null (a fresh, uncovered row)", async () => {
        const result = await pool.query(
            `INSERT INTO user_billing (user_id) VALUES ($1) RETURNING *;`,
            [userId],
        );
        expect(result.rows[0].auto_renew).toBe(false);
        expect(result.rows[0].paid_until).toBeNull();
        expect(result.rows[0].stripe_customer_id).toBeNull();
    });

    it("enforces at most one row per user (user_id is the primary key)", async () => {
        await pool.query(`INSERT INTO user_billing (user_id) VALUES ($1);`, [userId]);

        await expect(
            pool.query(`INSERT INTO user_billing (user_id) VALUES ($1);`, [userId]),
        ).rejects.toThrow();
    });

    it("rejects the same stripe_customer_id on two different users", async () => {
        await pool.query(
            `INSERT INTO user_billing (user_id, stripe_customer_id) VALUES ($1, 'cus_shared');`,
            [userId],
        );

        await expect(
            pool.query(
                `INSERT INTO user_billing (user_id, stripe_customer_id) VALUES ($1, 'cus_shared');`,
                [otherUserId],
            ),
        ).rejects.toThrow();
    });

    it("rejects the same stripe_subscription_id on two different users", async () => {
        await pool.query(
            `INSERT INTO user_billing (user_id, stripe_subscription_id) VALUES ($1, 'sub_shared');`,
            [userId],
        );

        await expect(
            pool.query(
                `INSERT INTO user_billing (user_id, stripe_subscription_id) VALUES ($1, 'sub_shared');`,
                [otherUserId],
            ),
        ).rejects.toThrow();
    });

    it("allows many rows with a null stripe_customer_id / stripe_subscription_id", async () => {
        await pool.query(`INSERT INTO user_billing (user_id) VALUES ($1);`, [userId]);
        await expect(
            pool.query(`INSERT INTO user_billing (user_id) VALUES ($1);`, [otherUserId]),
        ).resolves.toBeDefined();
    });

    it("deletes the row when the referenced user is deleted (ON DELETE CASCADE)", async () => {
        await pool.query(
            `INSERT INTO user_billing (user_id, paid_until) VALUES ($1, NOW() + INTERVAL '1 year');`,
            [userId],
        );

        await pool.query("DELETE FROM users WHERE id = $1;", [userId]);

        const row = await pool.query("SELECT * FROM user_billing WHERE user_id = $1;", [userId]);
        expect(row.rows).toHaveLength(0);
    });
});
