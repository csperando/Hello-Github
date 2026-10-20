import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("0010_create_payments migration", () => {
    const usersRepo = UsersRepository.repo();
    // fixed, out-of-range-for-real-GitHub id / reserved-range EIN so these
    // fixtures never collide with real data
    const testGitHubId = -103;
    const fixtureEin = "000000101";

    let userId: string;
    let fixtureOrgId: number;

    beforeAll(async () => {
        await runMigrations();

        const org = await pool.query(
            "INSERT INTO eo_bmf (ein, name) VALUES ($1, $2) RETURNING id;",
            [fixtureEin, "Payments Schema Test Charity"],
        );
        fixtureOrgId = org.rows[0].id;
    });

    afterAll(async () => {
        await pool.query("DELETE FROM eo_bmf WHERE ein = $1;", [fixtureEin]);
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-payments-schema-test",
            github_email: "octocat-payments-schema-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-payments-schema-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwMw==",
            github_profile_url: "https://github.com/octocat-payments-schema-test",
            avatar_url: "https://avatars.githubusercontent.com/u/103?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM payments WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    const insert = (overrides: Record<string, unknown> = {}) => {
        const row = {
            user_id: userId,
            stripe_event_id: "evt_test_1",
            stripe_object_id: "pi_test_1",
            kind: "one_time",
            status: "succeeded",
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
            charity_ein_id: fixtureOrgId,
            ...overrides,
        };
        return pool.query(
            `INSERT INTO payments (
                user_id, stripe_event_id, stripe_object_id, kind, status,
                amount_total_cents, amount_platform_cents, amount_charity_cents, charity_ein_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;`,
            [
                row.user_id, row.stripe_event_id, row.stripe_object_id, row.kind, row.status,
                row.amount_total_cents, row.amount_platform_cents, row.amount_charity_cents, row.charity_ein_id,
            ],
        );
    };

    it("has the expected columns and nullability", async () => {
        const columns = await pool.query(`
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'payments';
        `);
        const byName: Record<string, { is_nullable: string }> = Object.fromEntries(
            columns.rows.map((row: { column_name: string; is_nullable: string }) => [row.column_name, row]),
        );

        expect(Object.keys(byName).sort()).toEqual(
            [
                "id", "user_id", "stripe_event_id", "stripe_object_id", "kind", "status",
                "amount_total_cents", "amount_platform_cents", "amount_charity_cents", "charity_ein_id",
                "period_start", "period_end", "created_at",
                "amount_refunded_cents", "refunded_at", "stripe_refund_id", "admin_note",
            ].sort(),
        );
        expect(byName.user_id?.is_nullable).toBe("NO");
        expect(byName.stripe_event_id?.is_nullable).toBe("NO");
        expect(byName.kind?.is_nullable).toBe("NO");
        expect(byName.amount_total_cents?.is_nullable).toBe("NO");
        expect(byName.charity_ein_id?.is_nullable).toBe("YES");
        expect(byName.period_start?.is_nullable).toBe("YES");
    });

    it("accepts a well-formed one-time payment row", async () => {
        const result = await insert();
        expect(result.rows[0].amount_total_cents).toBe(1000);
        expect(result.rows[0].charity_ein_id).toBe(fixtureOrgId);
    });

    it("rejects a duplicate stripe_event_id (webhook idempotency)", async () => {
        await insert({ stripe_event_id: "evt_dup" });
        await expect(insert({ stripe_event_id: "evt_dup", stripe_object_id: "pi_other" })).rejects.toThrow();
    });

    it("rejects a kind outside the allowed set", async () => {
        await expect(insert({ kind: "refund" })).rejects.toThrow();
    });

    it("rejects a split that does not sum to the total", async () => {
        await expect(
            insert({ amount_total_cents: 1000, amount_platform_cents: 300, amount_charity_cents: 600 }),
        ).rejects.toThrow();
    });

    it("rejects negative amounts", async () => {
        await expect(
            insert({ amount_total_cents: 0, amount_platform_cents: -100, amount_charity_cents: 100 }),
        ).rejects.toThrow();
    });

    it("allows a platform-only payment (no charity, charity id null)", async () => {
        const result = await insert({
            amount_total_cents: 500,
            amount_platform_cents: 500,
            amount_charity_cents: 0,
            charity_ein_id: null,
        });
        expect(result.rows[0].amount_charity_cents).toBe(0);
        expect(result.rows[0].charity_ein_id).toBeNull();
    });

    it("nulls charity_ein_id (rather than blocking) when the referenced charity is deleted", async () => {
        const ein = "000000102";
        const org = await pool.query("INSERT INTO eo_bmf (ein, name) VALUES ($1, $2) RETURNING id;", [ein, "Doomed Charity"]);
        const orgId = org.rows[0].id;

        await insert({ stripe_event_id: "evt_charity_del", charity_ein_id: orgId });
        await pool.query("DELETE FROM eo_bmf WHERE id = $1;", [orgId]);

        const row = await pool.query("SELECT charity_ein_id FROM payments WHERE stripe_event_id = 'evt_charity_del';");
        expect(row.rows[0].charity_ein_id).toBeNull();
    });

    it("does not cascade-delete the user (user_id FK is NO ACTION, matching designs/run_log)", async () => {
        const constraints = await pool.query(`
            SELECT confdeltype FROM pg_constraint WHERE conname = 'payments_user_id_fkey';
        `);
        expect(constraints.rows[0]?.confdeltype).toBe("a");
    });
});
