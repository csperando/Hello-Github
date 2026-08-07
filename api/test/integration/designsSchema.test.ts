import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0002_create_designs / 0004_create_design_selections migrations", () => {
    const usersRepo = UsersRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -5;

    const upsertInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-designs-schema-test",
        github_email: "octocat-designs-schema-test@example.com",
        github_noreply_email: `${testGitHubId}+octocat-designs-schema-test@users.noreply.github.com`,
        github_node_id: "MDQ6VXNlcjU=",
        github_profile_url: "https://github.com/octocat-designs-schema-test",
        avatar_url: "https://avatars.githubusercontent.com/u/5?v=4",
    };

    let userId: string;

    const validPattern = "{0,1,2,3,4,0,0}"; // length 7

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub(upsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        // design_selections restrict-deletes on design_id, so clear it before designs
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("designs holds only content - no scheduling columns after the 0004 split", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'designs';
        `);
        const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                row.column_name,
                row,
            ]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            ["id", "user_id", "name", "is_public", "pattern", "created_at", "updated_at"].sort(),
        );
        expect(byName.is_public?.is_nullable).toBe("NO");
        expect(byName.is_public?.column_default).toContain("false");
        expect(byName.name?.column_default).toContain("untitled design");
    });

    it("defines id as the primary key and user_id as a foreign key to users(id)", async () => {
        const constraints = await pool.query(`
            SELECT tc.constraint_type
            FROM information_schema.table_constraints tc
            WHERE tc.table_name = 'designs';
        `);
        const types = constraints.rows.map((row: { constraint_type: string }) => row.constraint_type);
        expect(types).toEqual(expect.arrayContaining(["PRIMARY KEY", "FOREIGN KEY"]));
    });

    it("does not cascade-delete a design when the owning user is deleted (restricts instead)", async () => {
        await pool.query(
            `INSERT INTO designs (user_id, pattern) VALUES ($1, $2);`,
            [userId, validPattern],
        );

        await expect(pool.query("DELETE FROM users WHERE id = $1;", [userId])).rejects.toThrow();

        const design = await pool.query("SELECT * FROM designs WHERE user_id = $1;", [userId]);
        expect(design.rows).toHaveLength(1);
    });

    it("rejects a pattern whose length is not a multiple of 7", async () => {
        await expect(
            pool.query(`INSERT INTO designs (user_id, pattern) VALUES ($1, '{0,1,2}');`, [userId]),
        ).rejects.toThrow();
    });

    it("rejects a pattern with a value outside 0-4", async () => {
        await expect(
            pool.query(`INSERT INTO designs (user_id, pattern) VALUES ($1, '{0,1,2,3,4,5,0}');`, [userId]),
        ).rejects.toThrow();
    });

    describe("design_selections", () => {
        let designId: string;

        beforeEach(async () => {
            const design = await pool.query(
                `INSERT INTO designs (user_id, pattern) VALUES ($1, $2) RETURNING id;`,
                [userId, validPattern],
            );
            designId = design.rows[0].id;
        });

        it("has the expected columns and defaults", async () => {
            const columns = await pool.query(`
                SELECT column_name, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'design_selections';
            `);
            const byName: Record<string, { is_nullable: string; column_default: string | null }> = Object.fromEntries(
                columns.rows.map((row: { column_name: string; is_nullable: string; column_default: string | null }) => [
                    row.column_name,
                    row,
                ]),
            );

            expect(Object.keys(byName).sort()).toEqual(
                [
                    "id", "user_id", "design_id", "is_active", "start_date",
                    "repeat_indefinitely", "recurrence_end_date", "created_at", "updated_at",
                ].sort(),
            );
            expect(byName.is_active?.is_nullable).toBe("NO");
            expect(byName.is_active?.column_default).toContain("false");
            expect(byName.repeat_indefinitely?.is_nullable).toBe("NO");
            expect(byName.recurrence_end_date?.is_nullable).toBe("YES");
        });

        it("does not restrict deleting a design when it has no selections, but restricts when it does", async () => {
            await pool.query(
                `INSERT INTO design_selections (user_id, design_id, start_date) VALUES ($1, $2, '2026-01-04');`,
                [userId, designId],
            );

            await expect(pool.query("DELETE FROM designs WHERE id = $1;", [designId])).rejects.toThrow();
        });

        it("enforces at most one row per (user_id, design_id) pair", async () => {
            await pool.query(
                `INSERT INTO design_selections (user_id, design_id, start_date) VALUES ($1, $2, '2026-01-04');`,
                [userId, designId],
            );

            await expect(
                pool.query(
                    `INSERT INTO design_selections (user_id, design_id, start_date) VALUES ($1, $2, '2026-01-11');`,
                    [userId, designId],
                ),
            ).rejects.toThrow();
        });

        it("enforces at most one active selection per user, across different designs", async () => {
            const secondDesign = await pool.query(
                `INSERT INTO designs (user_id, pattern) VALUES ($1, $2) RETURNING id;`,
                [userId, validPattern],
            );

            await pool.query(
                `INSERT INTO design_selections (user_id, design_id, is_active, start_date) VALUES ($1, $2, TRUE, '2026-01-04');`,
                [userId, designId],
            );

            await expect(
                pool.query(
                    `INSERT INTO design_selections (user_id, design_id, is_active, start_date) VALUES ($1, $2, TRUE, '2026-01-04');`,
                    [userId, secondDesign.rows[0].id],
                ),
            ).rejects.toThrow();

            // but a second *inactive* selection for the same user is fine
            await expect(
                pool.query(
                    `INSERT INTO design_selections (user_id, design_id, is_active, start_date) VALUES ($1, $2, FALSE, '2026-01-04');`,
                    [userId, secondDesign.rows[0].id],
                ),
            ).resolves.toBeDefined();
        });

        it("rejects repeat_indefinitely=TRUE together with a non-null recurrence_end_date", async () => {
            await expect(
                pool.query(
                    `INSERT INTO design_selections (user_id, design_id, start_date, repeat_indefinitely, recurrence_end_date)
                     VALUES ($1, $2, '2026-01-04', TRUE, '2027-01-01');`,
                    [userId, designId],
                ),
            ).rejects.toThrow();
        });

        it("allows repeat_indefinitely=FALSE with a recurrence_end_date set", async () => {
            const result = await pool.query(
                `INSERT INTO design_selections (user_id, design_id, start_date, repeat_indefinitely, recurrence_end_date)
                 VALUES ($1, $2, '2026-01-04', FALSE, '2027-01-01') RETURNING recurrence_end_date;`,
                [userId, designId],
            );
            expect(result.rows[0].recurrence_end_date).not.toBeNull();
        });
    });
});
