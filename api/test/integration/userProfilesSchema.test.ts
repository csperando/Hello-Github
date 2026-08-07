import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0001_create_user_profiles migration", () => {
    beforeAll(async () => {
        await runMigrations();
    });

    it("creates a user_profiles table with the expected columns and defaults", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'user_profiles';
        `);
        const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                row.column_name,
                row,
            ]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            [
                "user_id", "display_name", "default_charity", "public_opt_in",
                "timezone", "use_real_email", "created_at", "updated_at",
            ].sort(),
        );
        expect(byName.public_opt_in?.is_nullable).toBe("NO");
        expect(byName.public_opt_in?.column_default).toContain("true");
        expect(byName.display_name?.is_nullable).toBe("YES");
        expect(byName.default_charity?.is_nullable).toBe("YES");
    });

    it("defines user_id as both the primary key and a foreign key to users(id)", async () => {
        const constraints = await pool.query(`
            SELECT tc.constraint_type
            FROM information_schema.table_constraints tc
            WHERE tc.table_name = 'user_profiles';
        `);
        const types = constraints.rows.map((row: { constraint_type: string }) => row.constraint_type);
        expect(types).toEqual(expect.arrayContaining(["PRIMARY KEY", "FOREIGN KEY"]));
    });

    describe("0003_add_user_profile_timezone_and_email_pref migration", () => {
        it("adds timezone defaulting to UTC and use_real_email defaulting to false, both NOT NULL", async () => {
            const columns = await pool.query(`
                SELECT column_name, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'user_profiles' AND column_name IN ('timezone', 'use_real_email');
            `);
            const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
                columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                    row.column_name,
                    row,
                ]),
            );

            expect(byName.timezone?.is_nullable).toBe("NO");
            expect(byName.timezone?.column_default).toContain("UTC");
            expect(byName.use_real_email?.is_nullable).toBe("NO");
            expect(byName.use_real_email?.column_default).toContain("false");
        });
    });

    describe("0006_change_default_charity_to_eo_bmf_fk migration", () => {
        it("changes default_charity to an integer column", async () => {
            const columns = await pool.query(`
                SELECT data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'user_profiles' AND column_name = 'default_charity';
            `);

            expect(columns.rows[0]?.data_type).toBe("bigint");
            expect(columns.rows[0]?.is_nullable).toBe("YES");
        });

        it("adds a foreign key from default_charity to eo_bmf(id)", async () => {
            const fks = await pool.query(`
                SELECT ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
                WHERE tc.table_name = 'user_profiles'
                    AND tc.constraint_type = 'FOREIGN KEY'
                    AND kcu.column_name = 'default_charity';
            `);

            expect(fks.rows).toEqual(
                expect.arrayContaining([expect.objectContaining({ referenced_table: "eo_bmf", referenced_column: "id" })]),
            );
        });
    });

    describe("cascade behavior", () => {
        const repo = UsersRepository.repo();
        // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
        const testGitHubId = -2;

        const upsertInput: iGitHubUpsertInput = {
            github_id: testGitHubId,
            github_username: "octocat-profile-test",
            github_email: "octocat-profile-test@example.com",
            github_node_id: "MDQ6VXNlcjI=",
            github_profile_url: "https://github.com/octocat-profile-test",
            avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
        };

        afterEach(async () => {
            await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
        });

        it("deletes the profile row when the owning user is deleted", async () => {
            const user = await repo.upsertFromGitHub(upsertInput);
            await pool.query(
                "INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2);",
                [user.id, "Test Display Name"],
            );

            await pool.query("DELETE FROM users WHERE id = $1;", [user.id]);

            const profile = await pool.query("SELECT * FROM user_profiles WHERE user_id = $1;", [user.id]);
            expect(profile.rows).toHaveLength(0);
        });
    });
});
