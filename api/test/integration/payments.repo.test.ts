import pool, { withTransaction } from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import PaymentsRepository from "../../repository/payments.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("PaymentsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const paymentsRepo = PaymentsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id / reserved-range EIN so these
    // fixtures never collide with real data
    const testGitHubId = -105;
    const fixtureEin = "000000103";

    let userId: string;
    let fixtureOrgId: number;

    beforeAll(async () => {
        await runMigrations();
        const org = await pool.query(
            "INSERT INTO eo_bmf (ein, name) VALUES ($1, $2) RETURNING id;",
            [fixtureEin, "Payments Repo Test Charity"],
        );
        fixtureOrgId = org.rows[0].id;
    });

    afterAll(async () => {
        await pool.query("DELETE FROM eo_bmf WHERE ein = $1;", [fixtureEin]);
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-payments-repo-test",
            github_email: "octocat-payments-repo-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-payments-repo-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwNQ==",
            github_profile_url: "https://github.com/octocat-payments-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/105?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM payments WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    const baseInput = (overrides = {}) => ({
        user_id: userId,
        stripe_event_id: "evt_1",
        stripe_object_id: "pi_1",
        kind: "one_time" as const,
        status: "succeeded",
        amount_total_cents: 1000,
        amount_platform_cents: 300,
        amount_charity_cents: 700,
        charity_ein_id: fixtureOrgId,
        period_start: "2026-01-01T00:00:00.000Z",
        period_end: "2027-01-01T00:00:00.000Z",
        ...overrides,
    });

    describe("create", () => {
        it("inserts a ledger row and returns it", async () => {
            const row = await paymentsRepo.create(baseInput());
            expect(row.user_id).toBe(userId);
            expect(row.amount_charity_cents).toBe(700);
            expect(row.charity_ein_id).toBe(fixtureOrgId);
            expect(new Date(row.period_end).toISOString()).toBe("2027-01-01T00:00:00.000Z");
        });

        it("allows a platform-only row with a null charity", async () => {
            const row = await paymentsRepo.create(
                baseInput({ amount_platform_cents: 1000, amount_charity_cents: 0, charity_ein_id: null }),
            );
            expect(row.charity_ein_id).toBeNull();
        });

        it("rejects a second row with the same stripe_event_id", async () => {
            await paymentsRepo.create(baseInput({ stripe_event_id: "evt_dup" }));
            await expect(paymentsRepo.create(baseInput({ stripe_event_id: "evt_dup", stripe_object_id: "pi_2" }))).rejects.toThrow();
        });

        it("given a client, runs on that transaction and rolls back with it", async () => {
            await expect(
                withTransaction(async (client) => {
                    await paymentsRepo.create(baseInput({ stripe_event_id: "evt_tx" }), client);
                    throw new Error("boom");
                }),
            ).rejects.toThrow("boom");

            expect(await paymentsRepo.existsByStripeEventId("evt_tx")).toBe(false);
        });
    });

    describe("existsByStripeEventId", () => {
        it("is false before and true after the event is recorded", async () => {
            expect(await paymentsRepo.existsByStripeEventId("evt_probe")).toBe(false);
            await paymentsRepo.create(baseInput({ stripe_event_id: "evt_probe" }));
            expect(await paymentsRepo.existsByStripeEventId("evt_probe")).toBe(true);
        });
    });

    describe("listForUser / getLatestForUser", () => {
        it("returns the user's rows newest-first", async () => {
            await paymentsRepo.create(baseInput({ stripe_event_id: "evt_old" }));
            // ensure a strictly later created_at on the second row
            await new Promise((r) => setTimeout(r, 10));
            await paymentsRepo.create(baseInput({ stripe_event_id: "evt_new" }));

            const rows = await paymentsRepo.listForUser(userId);
            expect(rows.map((r) => r.stripe_event_id)).toEqual(["evt_new", "evt_old"]);

            const latest = await paymentsRepo.getLatestForUser(userId);
            expect(latest.stripe_event_id).toBe("evt_new");
        });

        it("getLatestForUser returns null when the user has no payments", async () => {
            expect(await paymentsRepo.getLatestForUser(userId)).toBeNull();
        });
    });
});
