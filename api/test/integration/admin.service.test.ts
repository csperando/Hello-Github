import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import BackfillJobsRepository from "../../repository/backfillJobs.repo";
import PaymentsRepository from "../../repository/payments.repo";
import { AdminService } from "../../services/admin.service";
import { DesignService } from "../../services/designs.service";
import { iGitHubUpsertInput } from "../../models/users";

/** The admin console against the real schema: queries, constraints, transactions, audit rows. */
describe("AdminService (real DB)", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    const jobsRepo = BackfillJobsRepository.repo();
    const paymentsRepo = PaymentsRepository.repo();
    const admin = new AdminService();
    // fixed, out-of-range-for-real-GitHub ids so this test never collides with real data
    const ADMIN_GH = -110;
    const USER_GH = -111;
    const pattern = [0, 1, 0, 0, 0, 0, 0];

    let adminId: string;
    let userId: string;
    let designId: string;
    let selectionId: string;
    let counter = 0;
    const unique = (prefix: string) => `${prefix}_admin_test_${Date.now()}_${counter++}`;

    async function makeUser(githubId: number, username: string, role: string) {
        const user = await usersRepo.upsertFromGitHub({
            github_id: githubId,
            github_username: username,
            github_email: `${username}@example.com`,
            github_noreply_email: `${githubId}+${username}@users.noreply.github.com`,
            github_node_id: `node-${username}`,
            github_profile_url: `https://github.com/${username}`,
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        } as iGitHubUpsertInput);
        await pool.query("UPDATE users SET role = $2 WHERE id = $1;", [user.id, role]);
        return user.id as string;
    }

    async function makePayment(totalCents: number, stripeObjectId = unique("pi")) {
        return paymentsRepo.create({
            user_id: userId,
            stripe_event_id: unique("evt"),
            stripe_object_id: stripeObjectId,
            kind: "one_time",
            status: "succeeded",
            amount_total_cents: totalCents,
            amount_platform_cents: 0,
            amount_charity_cents: totalCents,
        });
    }

    /** A paid job, moved through to `status`. */
    async function makeJob(status: "awaiting_issue" | "ready" | "painting" | "done" | "failed", issueUrl: string | null = "https://github.com/o/canvas/issues/1") {
        const pi = unique("pi");
        await jobsRepo.createPending(selectionId, { year: 2025, pattern, start_date: "2024-12-29", custom_range: false }, pi);
        const paid = await jobsRepo.markPaid(pi);
        if (issueUrl) await pool.query("UPDATE backfill_jobs SET issue_url = $2 WHERE id = $1;", [paid.id, issueUrl]);
        if (status !== "awaiting_issue") await jobsRepo.setStatus(paid.id, status, status === "failed" ? "git push rejected" : null);
        return paid.id as string;
    }

    const auditRows = async (entityType: string, entityId: string) =>
        (await pool.query("SELECT action, changes, admin_user_id FROM admin_audit_log WHERE entity_type = $1 AND entity_id = $2;", [entityType, entityId])).rows;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        adminId = await makeUser(ADMIN_GH, "admin-service-test-admin", "admin");
        userId = await makeUser(USER_GH, "admin-service-test-user", "user");
        designId = (await designsRepo.create(userId, { name: "Turtles", pattern })).id;
        selectionId = (await selectionsRepo.create(userId, designId, { start_date: "2024-12-29", year: 2025 })).id;
    });

    afterEach(async () => {
        const ids = [adminId, userId];
        await pool.query("DELETE FROM admin_audit_log WHERE admin_user_id = ANY($1);", [ids]);
        await pool.query("DELETE FROM backfill_jobs WHERE selection_id IN (SELECT id FROM design_selections WHERE user_id = ANY($1));", [ids]);
        await pool.query("DELETE FROM design_selections WHERE user_id = ANY($1);", [ids]);
        await pool.query("DELETE FROM designs WHERE user_id = ANY($1);", [ids]);
        await pool.query("DELETE FROM payments WHERE user_id = ANY($1);", [ids]);
        await pool.query("DELETE FROM user_profiles WHERE user_id = ANY($1);", [ids]);
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [[ADMIN_GH, USER_GH]]);
    });

    afterAll(async () => {
        await pool.end();
    });

    describe("refunds", () => {
        it("records a partial then a full refund - the state follows the amount, and each change is logged", async () => {
            const p = await makePayment(2500);

            const partial = await admin.recordRefund(adminId, p.id, { amount_refunded_cents: 1000, refunded_at: "2026-10-20" });
            expect(partial).toMatchObject({ refund_state: "partially_refunded", amount_refunded_cents: 1000 });

            const full = await admin.recordRefund(adminId, p.id, { amount_refunded_cents: 2500, refunded_at: "2026-10-21", stripe_refund_id: "re_1" });
            expect(full).toMatchObject({ refund_state: "refunded", stripe_refund_id: "re_1" });

            const audit = await auditRows("payment", p.id);
            expect(audit).toHaveLength(2);
            expect(audit.every((row: { admin_user_id: string }) => row.admin_user_id === adminId)).toBe(true);
        });

        it("takes refunds off what the user has contributed", async () => {
            const p = await makePayment(2500);
            await makePayment(1000);

            await admin.recordRefund(adminId, p.id, { amount_refunded_cents: 2500, refunded_at: "2026-10-20" });

            expect((await admin.getUser(userId)).contributed_cents).toBe(1000);
            const [listed] = await admin.listUsers("admin-service-test-user");
            expect(listed.contributed_cents).toBe(1000);
        });

        it("the database itself refuses a refund larger than the charge", async () => {
            const p = await makePayment(2500);

            await expect(pool.query("UPDATE payments SET amount_refunded_cents = 2501 WHERE id = $1;", [p.id])).rejects.toThrow(
                /payments_amount_refunded_in_range/,
            );
        });

        it("filters by refund state and matches the search literally", async () => {
            const refunded = await makePayment(500);
            await makePayment(700);
            await admin.recordRefund(adminId, refunded.id, { amount_refunded_cents: 500, refunded_at: "2026-10-20" });

            const onlyRefunded = await admin.listPayments({ userId, refundState: "refunded" });
            expect(onlyRefunded.map((p: { id: string }) => p.id)).toEqual([refunded.id]);

            // a % in the search is a literal %, not a wildcard
            expect(await admin.listPayments({ userId, search: "%" })).toEqual([]);
            expect((await admin.listPayments({ search: "admin-service-test-user" })).length).toBe(2);
        });

        it("names the design and year a one-time payment bought, through its paint job", async () => {
            const pi = unique("pi");
            await jobsRepo.createPending(selectionId, { year: 2025, pattern, start_date: "2024-12-29", custom_range: false }, pi);
            const p = await makePayment(2500, pi);

            const [row] = await admin.listPayments({ userId });
            expect(row).toMatchObject({ id: p.id, design_name: "Turtles", design_year: 2025 });
        });

        it("a rejected refund writes nothing", async () => {
            const p = await makePayment(2500);

            await expect(admin.recordRefund(adminId, p.id, { amount_refunded_cents: 9999, refunded_at: "2026-10-20" })).rejects.toMatchObject({ status: 400 });

            expect((await paymentsRepo.adminGetById(p.id)).amount_refunded_cents).toBe(0);
            expect(await auditRows("payment", p.id)).toEqual([]);
        });
    });

    describe("paint jobs", () => {
        const paintStatus = async () => (await selectionsRepo.getByUserAndDesign(userId, designId)).paint_status;

        it("retries a failed job back to ready, clearing its error, and the design locks again", async () => {
            const jobId = await makeJob("failed");
            expect(await paintStatus()).toBe("error");

            const retried = await admin.retryJob(adminId, jobId);

            expect(retried).toMatchObject({ status: "ready", status_label: "queued", last_error: null, completed_at: null });
            expect(await paintStatus()).toBe("locked");
            expect(await auditRows("backfill_job", jobId)).toHaveLength(1);
        });

        it("retries to awaiting_issue when the canvas issue was never opened", async () => {
            const jobId = await makeJob("failed", null);

            expect((await admin.retryJob(adminId, jobId)).status).toBe("awaiting_issue");
        });

        it("only retries a failed job", async () => {
            const jobId = await makeJob("done");

            await expect(admin.retryJob(adminId, jobId)).rejects.toMatchObject({ status: 409 });
            expect(await auditRows("backfill_job", jobId)).toEqual([]);
        });

        it("won't retry while another paint of the design is in progress, and rolls back", async () => {
            const failedId = await makeJob("failed");
            await makeJob("painting");

            await expect(admin.retryJob(adminId, failedId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already in progress/) });
            expect((await jobsRepo.adminGetById(failedId)).status).toBe("failed");
            expect(await auditRows("backfill_job", failedId)).toEqual([]);
        });

        it("cancels a job that isn't mid-paint, but never one that is", async () => {
            const ready = await makeJob("ready");
            expect((await admin.cancelJob(adminId, ready)).status).toBe("cancelled");

            const painting = await makeJob("painting");
            await expect(admin.cancelJob(adminId, painting)).rejects.toMatchObject({ status: 409 });
            expect((await jobsRepo.adminGetById(painting)).status).toBe("painting");
        });

        it("lists a filter's jobs with counts", async () => {
            await makeJob("failed");
            await makeJob("done");

            const { jobs, counts } = await admin.listJobs("needs_attention");

            expect(jobs.filter((j: { selection_id: string }) => j.selection_id === selectionId).map((j: { status: string }) => j.status)).toEqual(["failed"]);
            expect(counts.needs_attention).toBeGreaterThanOrEqual(1);
            expect(counts.all).toBeGreaterThanOrEqual(2);
        });
    });

    describe("users", () => {
        it("updates role, account access and profile together, logging only what changed", async () => {
            await admin.updateUser(adminId, userId, { role: "admin", is_active: true, display_name: "Octo" });

            const user = await usersRepo.getUserById(userId);
            expect(user).toMatchObject({ role: "admin", is_active: true, display_name: "Octo" });
            const [row] = await auditRows("user", userId);
            expect(Object.keys(row.changes).sort()).toEqual(["display_name", "role"]);
        });

        it("refuses an admin removing their own admin access", async () => {
            await expect(admin.updateUser(adminId, adminId, { role: "user" })).rejects.toMatchObject({ status: 400 });
            expect((await usersRepo.getUserById(adminId)).role).toBe("admin");
        });

        it("lists every design the user has, deleted ones too", async () => {
            await new DesignService().deleteSelection(userId, designId);

            const { designs } = await admin.getUser(userId);

            expect(designs).toHaveLength(1);
            expect(designs[0].deleted_at).not.toBeNull();
            expect(designs[0].design_deleted_at).not.toBeNull();
        });

        it("restores a deleted design: the selection and, since they own it, the design", async () => {
            await new DesignService().deleteSelection(userId, designId);

            await admin.restoreDesign(adminId, userId, designId);

            expect(await selectionsRepo.getByUserAndDesign(userId, designId)).toBeDefined();
            expect((await designsRepo.getById(designId)).deleted_at).toBeNull();
            expect(await auditRows("design_selection", selectionId)).toHaveLength(1);
        });

        it("404s restoring a design that isn't deleted", async () => {
            await expect(admin.restoreDesign(adminId, userId, designId)).rejects.toMatchObject({ status: 404 });
        });
    });

    it("the audit log only accepts known record types", async () => {
        await expect(
            pool.query("INSERT INTO admin_audit_log (admin_user_id, entity_type, entity_id, action) VALUES ($1, 'bogus', 'x', 'y');", [adminId]),
        ).rejects.toThrow(/admin_audit_log_entity_type_valid/);
    });
});
