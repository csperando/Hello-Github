import request from "supertest";
import { signedSidCookie } from "../helpers";

import type { iUserRepo } from "../../repository/users.repo";
import type { iUserProfileRepo } from "../../repository/userProfiles.repo";
import type { iPaymentsRepo } from "../../repository/payments.repo";
import type { iBackfillJobsRepo } from "../../repository/backfillJobs.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import type { iDesignsRepo } from "../../repository/designs.repo";
import type { iAdminAuditRepo } from "../../repository/adminAudit.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);
const profilesRepoMock = createMockRepoProxy<iUserProfileRepo>();
mockRepo("repository/userProfiles.repo", profilesRepoMock);
const paymentsRepoMock = createMockRepoProxy<iPaymentsRepo>();
mockRepo("repository/payments.repo", paymentsRepoMock);
const jobsRepoMock = createMockRepoProxy<iBackfillJobsRepo>();
mockRepo("repository/backfillJobs.repo", jobsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);
const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);
const auditRepoMock = createMockRepoProxy<iAdminAuditRepo>();
mockRepo("repository/adminAudit.repo", auditRepoMock);

// admin changes run in a transaction - a fake client keeps this tier DB-free
const fakeClient = { query: jest.fn() };
jest.mock("../../config/db", () => ({
    __esModule: true,
    default: { connect: jest.fn(), query: jest.fn() },
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn(fakeClient),
}));

import server from "../server";

afterAll(() => {
    server.close();
});

const ADMIN_ID = "523e4567-e89b-12d3-a456-426614174012";
const USER_ID = "323e4567-e89b-12d3-a456-426614174010";
const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const DESIGN_ID = "33333333-3333-4333-8333-333333333333";

const adminCookie = signedSidCookie(ADMIN_ID);
const userCookie = signedSidCookie(USER_ID);

const admin = { id: ADMIN_ID, github_username: "admin-user", role: "admin", is_active: true };
const user = { id: USER_ID, github_username: "octocat", role: "user", is_active: true, display_name: "The Octocat", default_charity: 42 };

const payment = (overrides: Record<string, unknown> = {}) => ({
    id: PAYMENT_ID,
    user_id: USER_ID,
    github_username: "octocat",
    user_email: "octocat@example.com",
    kind: "one_time",
    status: "succeeded",
    refund_state: "paid",
    amount_total_cents: 2500,
    amount_platform_cents: 500,
    amount_charity_cents: 2000,
    amount_refunded_cents: 0,
    charity_ein_id: 42,
    charity_name: "GiveDirectly",
    design_name: "Turtles",
    design_year: 2025,
    stripe_object_id: "pi_1",
    stripe_event_id: "evt_1",
    stripe_refund_id: null,
    refunded_at: null,
    admin_note: null,
    created_at: "2026-10-14T00:00:00.000Z",
    ...overrides,
});

const job = (overrides: Record<string, unknown> = {}) => ({
    id: JOB_ID,
    selection_id: "s1",
    user_id: USER_ID,
    github_username: "octocat",
    design_id: DESIGN_ID,
    design_name: "Turtles",
    year: 2019,
    status: "failed",
    pattern: [0, 1, 0, 0, 0, 0, 0],
    start_date: "2018-12-30",
    custom_range: true,
    issue_url: "https://github.com/o/canvas/issues/1",
    last_error: "git push rejected",
    stripe_payment_intent_id: "pi_1",
    created_at: "2026-10-09T00:00:00.000Z",
    updated_at: "2026-10-09T00:00:00.000Z",
    completed_at: "2026-10-09T01:00:00.000Z",
    ...overrides,
});

beforeEach(() => {
    for (const mock of [usersRepoMock, profilesRepoMock, paymentsRepoMock, jobsRepoMock, selectionsRepoMock, designsRepoMock, auditRepoMock]) {
        mock.__reset();
    }
    usersRepoMock.getUserById.mockImplementation(async (id: string) => (id === ADMIN_ID ? admin : id === USER_ID ? user : undefined));
    auditRepoMock.create.mockResolvedValue({ id: "a1" });
    auditRepoMock.listFor.mockResolvedValue([]);
});

const ROUTES: [string, string][] = [
    ["get", "/admin/payments"],
    ["patch", `/admin/payments/${PAYMENT_ID}`],
    ["get", `/admin/payments/${PAYMENT_ID}/history`],
    ["get", "/admin/jobs"],
    ["post", `/admin/jobs/${JOB_ID}/retry`],
    ["post", `/admin/jobs/${JOB_ID}/cancel`],
    ["get", `/admin/jobs/${JOB_ID}/history`],
    ["get", "/admin/users"],
    ["get", `/admin/users/${USER_ID}`],
    ["patch", `/admin/users/${USER_ID}`],
    ["post", `/admin/users/${USER_ID}/designs/${DESIGN_ID}/restore`],
];

describe("admin access", () => {
    it.each(ROUTES)("%s %s - 401 without a session", async (method, path) => {
        const res = await (request(server) as any)[method](path);
        expect(res.status).toBe(401);
    });

    it.each(ROUTES)("%s %s - 403 for a non-admin", async (method, path) => {
        const res = await (request(server) as any)[method](path).set("Cookie", userCookie);
        expect(res.status).toBe(403);
    });

    it("403s an admin whose account is turned off", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...admin, is_active: false });

        const res = await request(server).get("/admin/payments").set("Cookie", adminCookie);

        expect(res.status).toBe(403);
    });

    it("404s a malformed id before it reaches the database", async () => {
        const res = await request(server).get("/admin/users/not-a-uuid").set("Cookie", adminCookie);

        expect(res.status).toBe(404);
        expect(usersRepoMock.getUserById).toHaveBeenCalledTimes(1); // only the requireRole lookup
    });
});

describe("payments", () => {
    it("lists payments with the filters given", async () => {
        paymentsRepoMock.adminList.mockResolvedValue([payment()]);

        const res = await request(server).get("/admin/payments?search=octo&status=refunded&since=2026-10-01").set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(paymentsRepoMock.adminList).toHaveBeenCalledWith({ search: "octo", refundState: "refunded", since: "2026-10-01" });
        // stripe_event_id stays server-side
        expect(res.body.data[0]).not.toHaveProperty("stripe_event_id");
        expect(res.body.data[0]).toMatchObject({ refund_state: "paid", charity_name: "GiveDirectly", design_name: "Turtles" });
    });

    it("400s a bad filter", async () => {
        const res = await request(server).get("/admin/payments?status=succeeded").set("Cookie", adminCookie);
        expect(res.status).toBe(400);
    });

    it("records a refund and logs who changed what, in one transaction", async () => {
        paymentsRepoMock.adminGetById.mockResolvedValueOnce(payment()).mockResolvedValue(payment({ amount_refunded_cents: 2500, refund_state: "refunded" }));
        paymentsRepoMock.recordRefund.mockResolvedValue(payment({ amount_refunded_cents: 2500, stripe_refund_id: "re_1", admin_note: "duplicate" }));

        const res = await request(server)
            .patch(`/admin/payments/${PAYMENT_ID}`)
            .set("Cookie", adminCookie)
            .send({ amount_refunded_cents: 2500, refunded_at: "2026-10-20", stripe_refund_id: "re_1", admin_note: "duplicate" });

        expect(res.status).toBe(200);
        expect(res.body.data[0].refund_state).toBe("refunded");
        expect(paymentsRepoMock.recordRefund).toHaveBeenCalledWith(
            PAYMENT_ID,
            { amount_refunded_cents: 2500, refunded_at: "2026-10-20", stripe_refund_id: "re_1", admin_note: "duplicate" },
            fakeClient,
        );
        expect(auditRepoMock.create).toHaveBeenCalledWith(
            {
                admin_user_id: ADMIN_ID,
                entity_type: "payment",
                entity_id: PAYMENT_ID,
                action: "refund recorded",
                changes: {
                    amount_refunded_cents: { from: 0, to: 2500 },
                    refunded_at: { from: null, to: "2026-10-20" },
                    stripe_refund_id: { from: null, to: "re_1" },
                    admin_note: { from: null, to: "duplicate" },
                },
            },
            fakeClient,
        );
    });

    it("400s a refund larger than the charge, writing nothing", async () => {
        paymentsRepoMock.adminGetById.mockResolvedValue(payment());

        const res = await request(server)
            .patch(`/admin/payments/${PAYMENT_ID}`)
            .set("Cookie", adminCookie)
            .send({ amount_refunded_cents: 2600, refunded_at: "2026-10-20" });

        expect(res.status).toBe(400);
        expect(paymentsRepoMock.recordRefund).not.toHaveBeenCalled();
        expect(auditRepoMock.create).not.toHaveBeenCalled();
    });

    it("404s an unknown payment", async () => {
        paymentsRepoMock.adminGetById.mockResolvedValue(undefined);

        const res = await request(server).patch(`/admin/payments/${PAYMENT_ID}`).set("Cookie", adminCookie).send({ amount_refunded_cents: 0 });

        expect(res.status).toBe(404);
    });

    it("shows a payment's history newest first: admin changes plus when it was received", async () => {
        paymentsRepoMock.adminGetById.mockResolvedValue(payment());
        auditRepoMock.listFor.mockResolvedValue([
            { action: "refund recorded", created_at: "2026-10-20T00:00:00.000Z", admin_username: "admin-user", changes: {} },
        ]);

        const res = await request(server).get(`/admin/payments/${PAYMENT_ID}/history`).set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(res.body.data.map((h: { what: string; by: string | null }) => [h.what, h.by])).toEqual([
            ["refund recorded", "admin-user"],
            ["payment received", null],
        ]);
    });
});

describe("paint jobs", () => {
    it("lists a filter's jobs with counts for every filter", async () => {
        jobsRepoMock.adminList.mockResolvedValue([job()]);
        jobsRepoMock.adminCountsByStatus.mockResolvedValue({ failed: 1, painting: 2, ready: 1, done: 3, pending_payment: 1 });

        const res = await request(server).get("/admin/jobs?filter=needs_attention").set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(jobsRepoMock.adminList).toHaveBeenCalledWith(["failed"]);
        expect(res.body.data[0].counts).toEqual({ all: 8, needs_attention: 1, in_progress: 3, painted: 3, cancelled: 0, pending_payment: 1 });
        expect(res.body.data[0].jobs[0]).toMatchObject({ id: JOB_ID, last_error: "git push rejected" });
    });

    it("retries a failed job and logs it", async () => {
        jobsRepoMock.adminGetById.mockResolvedValueOnce(job()).mockResolvedValue(job({ status: "ready", last_error: null }));
        jobsRepoMock.retry.mockResolvedValue(job({ status: "ready", last_error: null }));

        const res = await request(server).post(`/admin/jobs/${JOB_ID}/retry`).set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(res.body.data[0].status).toBe("ready");
        expect(jobsRepoMock.retry).toHaveBeenCalledWith(JOB_ID, fakeClient);
        expect(auditRepoMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ entity_type: "backfill_job", action: "retried", changes: { status: { from: "failed", to: "ready" }, last_error: { from: "git push rejected", to: null } } }),
            fakeClient,
        );
    });

    it("409s a retry of a job that isn't failed, logging nothing", async () => {
        jobsRepoMock.adminGetById.mockResolvedValue(job({ status: "done" }));
        jobsRepoMock.retry.mockResolvedValue(undefined);

        const res = await request(server).post(`/admin/jobs/${JOB_ID}/retry`).set("Cookie", adminCookie);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Only a failed paint/);
        expect(auditRepoMock.create).not.toHaveBeenCalled();
    });

    it("409s a retry while another paint already locks the design", async () => {
        jobsRepoMock.adminGetById.mockResolvedValue(job());
        jobsRepoMock.retry.mockRejectedValue({ code: "23505", constraint: "idx_backfill_jobs_one_locking_per_selection" });

        const res = await request(server).post(`/admin/jobs/${JOB_ID}/retry`).set("Cookie", adminCookie);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already in progress/);
    });

    it("409s cancelling a job that's mid-paint", async () => {
        jobsRepoMock.adminGetById.mockResolvedValue(job({ status: "painting" }));
        jobsRepoMock.cancel.mockResolvedValue(undefined);

        const res = await request(server).post(`/admin/jobs/${JOB_ID}/cancel`).set("Cookie", adminCookie);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/in progress/);
    });

    it("cancels a job that can be, and logs it", async () => {
        jobsRepoMock.adminGetById.mockResolvedValueOnce(job({ status: "ready" })).mockResolvedValue(job({ status: "cancelled" }));
        jobsRepoMock.cancel.mockResolvedValue(job({ status: "cancelled" }));

        const res = await request(server).post(`/admin/jobs/${JOB_ID}/cancel`).set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(auditRepoMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: "cancelled", changes: { status: { from: "ready", to: "cancelled" } } }),
            fakeClient,
        );
    });
});

describe("users", () => {
    const detail = () => {
        selectionsRepoMock.adminListForUser.mockResolvedValue([]);
        paymentsRepoMock.adminList.mockResolvedValue([payment(), payment({ id: "p2", amount_refunded_cents: 2500, refund_state: "refunded" })]);
    };

    it("searches users", async () => {
        usersRepoMock.adminSearch.mockResolvedValue([{ id: USER_ID, github_username: "octocat", contributed_cents: 2500 }]);

        const res = await request(server).get("/admin/users?search=oct").set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(usersRepoMock.adminSearch).toHaveBeenCalledWith("oct");
    });

    it("shows a user's account, designs, payments and contributed total with refunds taken off", async () => {
        detail();

        const res = await request(server).get(`/admin/users/${USER_ID}`).set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(res.body.data[0].contributed_cents).toBe(2500);
        expect(res.body.data[0].user).toMatchObject({ github_username: "octocat", role: "user" });
        expect(paymentsRepoMock.adminList).toHaveBeenCalledWith({ userId: USER_ID });
    });

    it("404s an unknown user", async () => {
        const res = await request(server).get("/admin/users/44444444-4444-4444-8444-444444444444").set("Cookie", adminCookie);
        expect(res.status).toBe(404);
    });

    it("updates role, account access and profile, and logs only what changed", async () => {
        detail();
        usersRepoMock.setRoleAndActive.mockResolvedValue({});
        profilesRepoMock.upsert.mockResolvedValue({});

        const res = await request(server)
            .patch(`/admin/users/${USER_ID}`)
            .set("Cookie", adminCookie)
            .send({ role: "admin", is_active: true, display_name: "Octo" });

        expect(res.status).toBe(200);
        expect(usersRepoMock.setRoleAndActive).toHaveBeenCalledWith(USER_ID, { role: "admin", is_active: true }, fakeClient);
        expect(profilesRepoMock.upsert).toHaveBeenCalledWith(USER_ID, { display_name: "Octo", default_charity: undefined }, fakeClient);
        expect(auditRepoMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                entity_type: "user",
                changes: { role: { from: "user", to: "admin" }, display_name: { from: "The Octocat", to: "Octo" } },
            }),
            fakeClient,
        );
    });

    it("refuses an admin removing their own admin access, changing nothing", async () => {
        const res = await request(server).patch(`/admin/users/${ADMIN_ID}`).set("Cookie", adminCookie).send({ role: "user" });

        expect(res.status).toBe(400);
        expect(usersRepoMock.setRoleAndActive).not.toHaveBeenCalled();
    });

    it("restores a deleted design - and the design too when this user owns it", async () => {
        detail();
        designsRepoMock.getById.mockResolvedValue({ id: DESIGN_ID, user_id: USER_ID });
        selectionsRepoMock.restore.mockResolvedValue({ id: "s1" });
        designsRepoMock.restore.mockResolvedValue({ id: DESIGN_ID });

        const res = await request(server).post(`/admin/users/${USER_ID}/designs/${DESIGN_ID}/restore`).set("Cookie", adminCookie);

        expect(res.status).toBe(200);
        expect(selectionsRepoMock.restore).toHaveBeenCalledWith(USER_ID, DESIGN_ID, fakeClient);
        expect(designsRepoMock.restore).toHaveBeenCalledWith(DESIGN_ID, fakeClient);
        expect(auditRepoMock.create).toHaveBeenCalledWith(
            expect.objectContaining({ entity_type: "design_selection", entity_id: "s1", action: "restored", changes: { design_id: DESIGN_ID, design_restored: true } }),
            fakeClient,
        );
    });

    it("restores only the selection for someone else's design", async () => {
        detail();
        designsRepoMock.getById.mockResolvedValue({ id: DESIGN_ID, user_id: ADMIN_ID });
        selectionsRepoMock.restore.mockResolvedValue({ id: "s1" });

        await request(server).post(`/admin/users/${USER_ID}/designs/${DESIGN_ID}/restore`).set("Cookie", adminCookie);

        expect(designsRepoMock.restore).not.toHaveBeenCalled();
    });

    it("404s restoring a design that wasn't deleted", async () => {
        designsRepoMock.getById.mockResolvedValue({ id: DESIGN_ID, user_id: USER_ID });
        selectionsRepoMock.restore.mockResolvedValue(undefined);

        const res = await request(server).post(`/admin/users/${USER_ID}/designs/${DESIGN_ID}/restore`).set("Cookie", adminCookie);

        expect(res.status).toBe(404);
        expect(auditRepoMock.create).not.toHaveBeenCalled();
    });
});
