import { iResponse } from "../../models/response";
import request from "supertest";

import { iUser } from "../../models/users";
import { signedSidCookie } from "../helpers";

const owner: iUser = {
    id: "323e4567-e89b-12d3-a456-426614174010",
    github_id: 101,
    github_username: "design-owner",
    role: "user",
    is_active: true,
};
const ownerCookie = signedSidCookie(owner.id as string);

const otherUser: iUser = {
    id: "423e4567-e89b-12d3-a456-426614174011",
    github_id: 102,
    github_username: "other-user",
    role: "user",
    is_active: true,
};
const otherUserCookie = signedSidCookie(otherUser.id as string);

const admin: iUser = {
    id: "523e4567-e89b-12d3-a456-426614174012",
    github_id: 103,
    github_username: "design-admin",
    role: "admin",
    is_active: true,
};
const adminCookie = signedSidCookie(admin.id as string);

import type { iDesignsRepo } from "../../repository/designs.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import type { iUserRepo } from "../../repository/users.repo";
import type { iUserBillingRepo } from "../../repository/userBilling.repo";
import type { iDesignPaintStatusesRepo } from "../../repository/designPaintStatuses.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);
const billingRepoMock = createMockRepoProxy<iUserBillingRepo>();
mockRepo("repository/userBilling.repo", billingRepoMock);
const paintStatusesRepoMock = createMockRepoProxy<iDesignPaintStatusesRepo>();
mockRepo("repository/designPaintStatuses.repo", paintStatusesRepoMock);

// DesignService.createDesign/deleteSelection wrap their (fully-mocked) repo
// calls in a real pg transaction (BEGIN/COMMIT/ROLLBACK via pool.connect()) -
// fake that connection out too, so these request-level tests stay DB-free
// like every other file in this tier.
jest.mock("../../config/db", () => ({
    __esModule: true,
    default: {
        connect: jest.fn().mockResolvedValue({
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn(),
        }),
    },
}));

import server from "../server";

afterAll(() => {
    server.close();
});

const validCreateBody = {
    start_date: "2025-01-05", // Sunday
    year: 2025,
    pattern: [0, 1, 2, 3, 4, 0, 0],
};

function mockDesignRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "d1",
        user_id: owner.id,
        name: "untitled design",
        is_public: false,
        pattern: [0, 1, 2, 3, 4, 0, 0],
        ...overrides,
    };
}

function mockSelectionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "s1",
        user_id: owner.id,
        design_id: "d1",
        is_active: false,
        start_date: "2025-01-05",
        year: 2025,
        custom_range: false,
        repeat_indefinitely: false,
        recurrence_end_date: null,
        ...overrides,
    };
}

describe("Design routes", () => {
    beforeEach(() => {
        designsRepoMock.__reset();
        selectionsRepoMock.__reset();
        runLogRepoMock.__reset();
        usersRepoMock.__reset();
        billingRepoMock.__reset();
        // default: every test user is covered, so activation isn't blocked
        // unless a test explicitly says otherwise
        billingRepoMock.getByUserId.mockResolvedValue({ paid_until: new Date(Date.now() + 30 * 8.64e7).toISOString() });
        usersRepoMock.getUserById.mockImplementation(async (userId: string) => {
            if (userId === admin.id) return admin;
            if (userId === owner.id) return owner;
            if (userId === otherUser.id) return otherUser;
            return undefined;
        });
    });

    describe("POST /design", () => {
        it("creates a design and the creator's own selection together", async () => {
            designsRepoMock.create.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.create.mockResolvedValue(mockSelectionRow());

            const res = await request(server).post("/design").set("Cookie", ownerCookie).send(validCreateBody);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(designsRepoMock.create).toHaveBeenCalledWith(
                owner.id,
                { name: undefined, is_public: undefined, pattern: validCreateBody.pattern },
                expect.anything(),
            );
            expect(selectionsRepoMock.create).toHaveBeenCalledWith(
                owner.id,
                "d1",
                expect.objectContaining({ start_date: "2025-01-05" }),
                expect.anything(),
            );
            expect((body.data![0] as any).design).toEqual(mockDesignRow());
            expect((body.data![0] as any).selection).toEqual(mockSelectionRow());
        });

        it("ignores a user_id in the body (mass-assignment) and always uses the authenticated user", async () => {
            designsRepoMock.create.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.create.mockResolvedValue(mockSelectionRow());

            await request(server)
                .post("/design")
                .set("Cookie", ownerCookie)
                .send({ ...validCreateBody, user_id: otherUser.id, id: "attacker-id" });

            expect(designsRepoMock.create).toHaveBeenCalledWith(owner.id, expect.anything(), expect.anything());
        });

        it("rejects an invalid pattern with 400 and never calls the repo", async () => {
            const res = await request(server)
                .post("/design")
                .set("Cookie", ownerCookie)
                .send({ ...validCreateBody, pattern: [0, 1, 2] });

            expect(res.status).toBe(400);
            expect(designsRepoMock.create).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).post("/design").send(validCreateBody);
            expect(res.status).toBe(401);
            expect(designsRepoMock.create).not.toHaveBeenCalled();
        });
    });

    describe("GET /design", () => {
        it("lists the authenticated user's selections, joined with design content", async () => {
            const row = { ...mockSelectionRow(), name: "Heart", is_public: false, pattern: [0, 1, 2, 3, 4, 0, 0] };
            selectionsRepoMock.getAllForUser.mockResolvedValue([row]);

            const res = await request(server).get("/design").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.getAllForUser).toHaveBeenCalledWith(owner.id);
            expect(body.data).toEqual([row]);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).get("/design");
            expect(res.status).toBe(401);
        });
    });

    describe("GET /design/last-run", () => {
        it("returns the authenticated user's latest run status per design", async () => {
            runLogRepoMock.getLatestPerDesignForUser.mockResolvedValue([
                { design_id: "d1", target_date: "2025-01-05", commit_count: 5, status: "committed" },
            ]);

            const res = await request(server).get("/design/last-run").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(runLogRepoMock.getLatestPerDesignForUser).toHaveBeenCalledWith(owner.id);
            expect(body.data).toEqual([
                { design_id: "d1", target_date: "2025-01-05", commit_count: 5, status: "committed" },
            ]);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).get("/design/last-run");
            expect(res.status).toBe(401);
        });
    });

    describe("GET /design/:designId", () => {
        it("lets the owner read their own private design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server).get("/design/d1").set("Cookie", ownerCookie);
            expect(res.status).toBe(200);
        });

        it("sends only allowlisted columns, dropping anything else on the row", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ internal_note: "server-only" }));

            const res = await request(server).get("/design/d1").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.data![0]).toEqual(mockDesignRow());
            expect(res.text).not.toContain("internal_note");
        });

        it("rejects another user reading a private design with 403", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: false }));

            const res = await request(server).get("/design/d1").set("Cookie", otherUserCookie);
            expect(res.status).toBe(403);
        });

        it("lets another user read a public design with 200", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: true }));

            const res = await request(server).get("/design/d1").set("Cookie", otherUserCookie);
            expect(res.status).toBe(200);
        });

        it("lets an admin read another user's private design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: false }));

            const res = await request(server).get("/design/d1").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
        });

        it("returns 404 for a design that does not exist", async () => {
            designsRepoMock.getById.mockResolvedValue(undefined);

            const res = await request(server).get("/design/missing").set("Cookie", ownerCookie);
            expect(res.status).toBe(404);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).get("/design/d1");
            expect(res.status).toBe(401);
        });
    });

    describe("PATCH /design/:designId", () => {
        it("lets the owner update their own design content", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.update.mockResolvedValue(mockDesignRow({ name: "renamed" }));

            const res = await request(server)
                .patch("/design/d1")
                .set("Cookie", ownerCookie)
                .send({ name: "renamed" });

            expect(res.status).toBe(200);
            expect(designsRepoMock.update).toHaveBeenCalledWith("d1", { name: "renamed" });
        });

        it("rejects another (non-admin) user updating someone else's design with 403", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server)
                .patch("/design/d1")
                .set("Cookie", otherUserCookie)
                .send({ name: "renamed" });

            expect(res.status).toBe(403);
            expect(designsRepoMock.update).not.toHaveBeenCalled();
        });

        it("lets an admin update another user's design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.update.mockResolvedValue(mockDesignRow({ name: "renamed by admin" }));

            const res = await request(server)
                .patch("/design/d1")
                .set("Cookie", adminCookie)
                .send({ name: "renamed by admin" });

            expect(res.status).toBe(200);
        });

        it("ignores a user_id in the body (mass-assignment)", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.update.mockResolvedValue(mockDesignRow());

            await request(server)
                .patch("/design/d1")
                .set("Cookie", ownerCookie)
                .send({ name: "ok", user_id: otherUser.id });

            expect(designsRepoMock.update).toHaveBeenCalledWith(
                "d1",
                expect.not.objectContaining({ user_id: expect.anything() }),
            );
        });

        it("ignores scheduling fields - they aren't part of design content anymore", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.update.mockResolvedValue(mockDesignRow());

            await request(server)
                .patch("/design/d1")
                .set("Cookie", ownerCookie)
                .send({ name: "ok", start_date: "2025-01-06", repeat_indefinitely: true });

            expect(designsRepoMock.update).toHaveBeenCalledWith("d1", { name: "ok" });
        });

        it("rejects an invalid pattern with 400", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server)
                .patch("/design/d1")
                .set("Cookie", ownerCookie)
                .send({ pattern: [0, 1, 2] });

            expect(res.status).toBe(400);
            expect(designsRepoMock.update).not.toHaveBeenCalled();
        });

        it("returns 404 for a design that does not exist", async () => {
            designsRepoMock.getById.mockResolvedValue(undefined);

            const res = await request(server)
                .patch("/design/missing")
                .set("Cookie", ownerCookie)
                .send({ name: "renamed" });

            expect(res.status).toBe(404);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).patch("/design/d1").send({ name: "renamed" });
            expect(res.status).toBe(401);
            expect(designsRepoMock.update).not.toHaveBeenCalled();
        });
    });

    describe("GET /design/:designId/selections/count", () => {
        it("lets the owner see how many other users have this design active", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.countActiveExcludingUser.mockResolvedValue(4);

            const res = await request(server).get("/design/d1/selections/count").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.countActiveExcludingUser).toHaveBeenCalledWith("d1", owner.id);
            expect((body.data![0] as any).count).toBe(4);
        });

        it("lets an admin check another user's design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.countActiveExcludingUser.mockResolvedValue(0);

            const res = await request(server).get("/design/d1/selections/count").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
        });

        it("rejects another (non-admin) user with 403", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server).get("/design/d1/selections/count").set("Cookie", otherUserCookie);

            expect(res.status).toBe(403);
            expect(selectionsRepoMock.countActiveExcludingUser).not.toHaveBeenCalled();
        });

        it("returns 404 for a design that does not exist", async () => {
            designsRepoMock.getById.mockResolvedValue(undefined);

            const res = await request(server).get("/design/missing/selections/count").set("Cookie", ownerCookie);
            expect(res.status).toBe(404);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).get("/design/d1/selections/count");
            expect(res.status).toBe(401);
        });
    });

    describe("POST /design/:designId/select", () => {
        it("lets the owner select their own design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.create.mockResolvedValue(mockSelectionRow());

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ year: 2025, start_date: "2025-01-05" });

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.create).toHaveBeenCalledWith(
                owner.id,
                "d1",
                expect.objectContaining({ start_date: "2025-01-05" }),
            );
        });

        it("lets another user select a public design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: true }));
            selectionsRepoMock.create.mockResolvedValue(mockSelectionRow({ user_id: otherUser.id }));

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", otherUserCookie)
                .send({ year: 2025, start_date: "2025-01-05" });

            expect(res.status).toBe(200);
        });

        it("rejects another (non-admin) user selecting a private design with 403", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: false }));

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", otherUserCookie)
                .send({ year: 2025, start_date: "2025-01-05" });

            expect(res.status).toBe(403);
            expect(selectionsRepoMock.create).not.toHaveBeenCalled();
        });

        it("returns 404 for a design that does not exist", async () => {
            designsRepoMock.getById.mockResolvedValue(undefined);

            const res = await request(server)
                .post("/design/missing/select")
                .set("Cookie", ownerCookie)
                .send({ year: 2025, start_date: "2025-01-05" });

            expect(res.status).toBe(404);
        });

        it("rejects a non-Sunday start_date with 400", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ year: 2025, start_date: "2025-01-06" });

            expect(res.status).toBe(400);
            expect(selectionsRepoMock.create).not.toHaveBeenCalled();
        });

        it("translates a one-active-per-user conflict into a friendly 400", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            const err: any = new Error("duplicate key value violates unique constraint");
            err.code = "23505";
            err.constraint = "idx_design_selections_one_active_per_user";
            selectionsRepoMock.create.mockRejectedValue(err);

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ year: 2025, start_date: "2025-01-05", is_active: true });
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(400);
            expect(body.error).toMatch(/already have another design active/i);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).post("/design/d1/select").send({ year: 2025, start_date: "2025-01-05" });
            expect(res.status).toBe(401);
            expect(selectionsRepoMock.create).not.toHaveBeenCalled();
        });
    });

    describe("PATCH /design/:designId/select", () => {
        it("lets a user update their own selection", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow());
            selectionsRepoMock.update.mockResolvedValue(mockSelectionRow({ is_active: true }));

            const res = await request(server)
                .patch("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ is_active: true });

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.update).toHaveBeenCalledWith(owner.id, "d1", { is_active: true });
        });

        it("returns 404 when the user has no selection for this design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);

            const res = await request(server)
                .patch("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ is_active: true });

            expect(res.status).toBe(404);
            expect(selectionsRepoMock.update).not.toHaveBeenCalled();
        });

        it("translates a one-active-per-user conflict into a friendly 400", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow());
            const err: any = new Error("duplicate key value violates unique constraint");
            err.code = "23505";
            err.constraint = "idx_design_selections_one_active_per_user";
            selectionsRepoMock.update.mockRejectedValue(err);

            const res = await request(server)
                .patch("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ is_active: true });

            expect(res.status).toBe(400);
        });

        it("returns 402 when an uncovered user tries to activate a selection", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow());
            billingRepoMock.getByUserId.mockResolvedValue(null);

            const res = await request(server)
                .patch("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ is_active: true });

            expect(res.status).toBe(402);
            expect(selectionsRepoMock.update).not.toHaveBeenCalled();
        });

        it("still lets an uncovered user change non-activation fields", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow());
            selectionsRepoMock.update.mockResolvedValue(mockSelectionRow({ start_date: "2025-02-02" }));
            billingRepoMock.getByUserId.mockResolvedValue(null);

            const res = await request(server)
                .patch("/design/d1/select")
                .set("Cookie", ownerCookie)
                .send({ year: 2025, start_date: "2025-02-02" });

            expect(res.status).toBe(200);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).patch("/design/d1/select").send({ is_active: true });
            expect(res.status).toBe(401);
        });
    });

    describe("DELETE /design/:designId/select", () => {
        it("soft-deletes the owner's selection and their design", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ paint_status: "unpainted" }));
            selectionsRepoMock.softDelete.mockResolvedValue({ id: "s1" });
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.softDelete.mockResolvedValue({ id: "d1" });

            const res = await request(server).delete("/design/d1/select").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.softDelete).toHaveBeenCalledWith(owner.id, "d1", expect.anything());
            expect(designsRepoMock.softDelete).toHaveBeenCalledWith("d1", expect.anything());
            expect((body.data![0] as any).design_deleted).toBe(true);
        });

        it("only soft-deletes a non-owner's own selection, never the design", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ user_id: otherUser.id, paint_status: "unpainted" }));
            selectionsRepoMock.softDelete.mockResolvedValue({ id: "s2" });
            designsRepoMock.getById.mockResolvedValue(mockDesignRow({ is_public: true }));

            const res = await request(server).delete("/design/d1/select").set("Cookie", otherUserCookie);

            expect(res.status).toBe(200);
            expect(selectionsRepoMock.softDelete).toHaveBeenCalledWith(otherUser.id, "d1", expect.anything());
            expect(designsRepoMock.softDelete).not.toHaveBeenCalled();
            expect((JSON.parse(res.text).data[0] as any).design_deleted).toBe(false);
        });

        it("409s while the design is being painted, deleting nothing", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ paint_status: "locked" }));

            const res = await request(server).delete("/design/d1/select").set("Cookie", ownerCookie);

            expect(res.status).toBe(409);
            expect(selectionsRepoMock.softDelete).not.toHaveBeenCalled();
            expect(designsRepoMock.softDelete).not.toHaveBeenCalled();
        });

        it("returns 404 when the user has no selection for this design", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);

            const res = await request(server).delete("/design/d1/select").set("Cookie", ownerCookie);

            expect(res.status).toBe(404);
            expect(selectionsRepoMock.softDelete).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).delete("/design/d1/select");
            expect(res.status).toBe(401);
            expect(selectionsRepoMock.softDelete).not.toHaveBeenCalled();
        });
    });

    describe("deleted designs", () => {
        const deleted = () => mockDesignRow({ is_public: true, deleted_at: "2026-10-20T00:00:00.000Z" });

        it("404s GET for the owner who deleted it (their selection is gone too)", async () => {
            designsRepoMock.getById.mockResolvedValue(deleted());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);
            usersRepoMock.getUserById.mockResolvedValue(owner);

            const res = await request(server).get("/design/d1").set("Cookie", ownerCookie);

            expect(res.status).toBe(404);
        });

        it("stays readable to another user who already selected it", async () => {
            designsRepoMock.getById.mockResolvedValue(deleted());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ user_id: otherUser.id }));

            const res = await request(server).get("/design/d1").set("Cookie", otherUserCookie);

            expect(res.status).toBe(200);
        });

        it("can't be newly selected", async () => {
            designsRepoMock.getById.mockResolvedValue(deleted());

            const res = await request(server)
                .post("/design/d1/select")
                .set("Cookie", otherUserCookie)
                .send({ year: 2025, start_date: "2025-01-05" });

            expect(res.status).toBe(404);
            expect(selectionsRepoMock.create).not.toHaveBeenCalled();
        });

        it("can't be edited", async () => {
            designsRepoMock.getById.mockResolvedValue(deleted());

            const res = await request(server).patch("/design/d1").set("Cookie", ownerCookie).send({ name: "x" });

            expect(res.status).toBe(404);
            expect(designsRepoMock.update).not.toHaveBeenCalled();
        });
    });

    describe("while a paint is in progress (locked)", () => {
        beforeEach(() => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ paint_status: "locked" }));
        });

        it("409s a content edit", async () => {
            const res = await request(server).patch("/design/d1").set("Cookie", ownerCookie).send({ pattern: [1, 1, 1, 1, 1, 1, 1] });

            expect(res.status).toBe(409);
            expect(designsRepoMock.update).not.toHaveBeenCalled();
        });

        it("409s a schedule edit", async () => {
            const res = await request(server).patch("/design/d1/select").set("Cookie", ownerCookie).send({ year: 2024, start_date: "2024-01-07" });

            expect(res.status).toBe(409);
            expect(selectionsRepoMock.update).not.toHaveBeenCalled();
        });

        it("allows edits again once the paint finishes", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(mockSelectionRow({ paint_status: "painted" }));
            designsRepoMock.update.mockResolvedValue(mockDesignRow({ name: "x" }));

            const res = await request(server).patch("/design/d1").set("Cookie", ownerCookie).send({ name: "x" });

            expect(res.status).toBe(200);
        });
    });

    describe("GET /design/paint-statuses", () => {
        it("returns the paint-status definitions", async () => {
            const definitions = [
                { code: "unpainted", label: "not painted", description: "..." },
                { code: "locked", label: "painting", description: "..." },
            ];
            paintStatusesRepoMock.getAll.mockResolvedValue(definitions);

            const res = await request(server).get("/design/paint-statuses").set("Cookie", ownerCookie);

            expect(res.status).toBe(200);
            expect(JSON.parse(res.text).data).toEqual(definitions);
        });
    });
});
