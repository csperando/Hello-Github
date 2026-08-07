import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";

describe("0007_add_github_noreply_email migration", () => {
    beforeAll(async () => {
        await runMigrations();
    });

    it("adds github_noreply_email as a required column", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'github_noreply_email';
        `);

        expect(columns.rows[0]?.is_nullable).toBe("NO");
    });

    it("leaves email nullable - it's a derived cache, not a fact about the user", async () => {
        const columns = await pool.query(`
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'email';
        `);

        expect(columns.rows[0]?.is_nullable).toBe("YES");
    });
});
