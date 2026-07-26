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
import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

const validCreateBody = {
    start_date: "2026-01-04", // Sunday
    pattern: [0, 1, 2, 3, 4, 0, 0],
};

function mockDesignRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "d1",
        user_id: owner.id,
        name: "untitled design",
        is_public: false,
        start_date: "2026-01-04",
        end_date: "2026-01-10",
        pattern: [0, 1, 2, 3, 4, 0, 0],
        repeat_indefinitely: false,
        recurrence_end_date: null,
        ...overrides,
    };
}

describe("Design routes", () => {
    beforeEach(() => {
        designsRepoMock.__reset();
        usersRepoMock.__reset();
        usersRepoMock.getUserById.mockImplementation(async (userId: string) => {
            if (userId === admin.id) return admin;
            if (userId === owner.id) return owner;
            if (userId === otherUser.id) return otherUser;
            return undefined;
        });
    });

    describe("POST /design", () => {
        it("creates a design owned by the authenticated user", async () => {
            designsRepoMock.create.mockResolvedValue(mockDesignRow());

            const res = await request(server).post("/design").set("Cookie", ownerCookie).send(validCreateBody);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(designsRepoMock.create).toHaveBeenCalledWith(owner.id, expect.objectContaining({
                start_date: "2026-01-04",
                end_date: "2026-01-10",
                pattern: validCreateBody.pattern,
            }));
        });

        it("ignores a user_id in the body (mass-assignment) and always uses the authenticated user", async () => {
            designsRepoMock.create.mockResolvedValue(mockDesignRow());

            await request(server)
                .post("/design")
                .set("Cookie", ownerCookie)
                .send({ ...validCreateBody, user_id: otherUser.id, id: "attacker-id" });

            expect(designsRepoMock.create).toHaveBeenCalledWith(
                owner.id,
                expect.not.objectContaining({ user_id: expect.anything(), id: expect.anything() }),
            );
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
        it("lists only the authenticated user's own designs", async () => {
            designsRepoMock.getAllByUserId.mockResolvedValue([mockDesignRow()]);

            const res = await request(server).get("/design").set("Cookie", ownerCookie);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(designsRepoMock.getAllByUserId).toHaveBeenCalledWith(owner.id);
            expect(body.data).toEqual([mockDesignRow()]);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).get("/design");
            expect(res.status).toBe(401);
        });
    });

    describe("GET /design/:designId", () => {
        it("lets the owner read their own private design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server).get("/design/d1").set("Cookie", ownerCookie);
            expect(res.status).toBe(200);
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
        it("lets the owner update their own design", async () => {
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

        it("rejects an invalid patch body with 400", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server)
                .patch("/design/d1")
                .set("Cookie", ownerCookie)
                .send({ start_date: "2026-01-05" }); // not a Sunday

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

    describe("DELETE /design/:designId", () => {
        it("lets the owner delete their own design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.delete.mockResolvedValue({ id: "d1" });

            const res = await request(server).delete("/design/d1").set("Cookie", ownerCookie);

            expect(res.status).toBe(200);
            expect(designsRepoMock.delete).toHaveBeenCalledWith("d1");
        });

        it("rejects another (non-admin) user deleting someone else's design with 403", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());

            const res = await request(server).delete("/design/d1").set("Cookie", otherUserCookie);

            expect(res.status).toBe(403);
            expect(designsRepoMock.delete).not.toHaveBeenCalled();
        });

        it("lets an admin delete another user's design", async () => {
            designsRepoMock.getById.mockResolvedValue(mockDesignRow());
            designsRepoMock.delete.mockResolvedValue({ id: "d1" });

            const res = await request(server).delete("/design/d1").set("Cookie", adminCookie);
            expect(res.status).toBe(200);
        });

        it("returns 404 for a design that does not exist", async () => {
            designsRepoMock.getById.mockResolvedValue(undefined);

            const res = await request(server).delete("/design/missing").set("Cookie", ownerCookie);
            expect(res.status).toBe(404);
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).delete("/design/d1");
            expect(res.status).toBe(401);
            expect(designsRepoMock.delete).not.toHaveBeenCalled();
        });
    });
});
