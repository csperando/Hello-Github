import { iResponse } from "../../models/response";
import request from "supertest";

import { iUser } from "../../models/users";
import { signedSidCookie } from "../helpers";
const mockUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    github_id: 12,
    github_username: "csperando",
    role: "admin",
    is_active: true,
};
const adminCookie = signedSidCookie(mockUser.id as string);

import type { iUserRepo } from "../../repository/users.repo";
import type { iUserProfileRepo } from "../../repository/userProfiles.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);
const profilesRepoMock = createMockRepoProxy<iUserProfileRepo>();
mockRepo("repository/userProfiles.repo", profilesRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

describe("User routes", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();
        // satisfies requireRole's lookup of the requesting (admin) user on every route
        usersRepoMock.getUserById.mockResolvedValue(mockUser);
    });

    it("Should get all users", async () => {
        usersRepoMock.getAllUsers.mockResolvedValue([mockUser]);

        const res = await request(server).get("/user").set("Cookie", adminCookie);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should reject GET /user with no session", async () => {
        const res = await request(server).get("/user");
        expect(res.status).toBe(401);
    });

    it("Should get a user by id", async () => {
        // same repo method/id serves both requireRole's check and the handler's own lookup
        const res = await request(server).get("/user/" + mockUser.id).set("Cookie", adminCookie);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should reject GET /user/:userId with no session", async () => {
        const res = await request(server).get("/user/" + mockUser.id);
        expect(res.status).toBe(401);
    });

    it("Should reject GET /user/:userId for a non-admin role", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockUser, role: "user" });

        const res = await request(server).get("/user/" + mockUser.id).set("Cookie", adminCookie);
        expect(res.status).toBe(403);
    });

    it("Should reject GET /user/:userId for an inactive admin account", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockUser, is_active: false });

        const res = await request(server).get("/user/" + mockUser.id).set("Cookie", adminCookie);
        expect(res.status).toBe(403);
    });

    it("Should get a user by GitHub id", async () => {
        usersRepoMock.getUserByGitHubId.mockResolvedValue([mockUser]);

        const res = await request(server).get("/user/gh/" + mockUser.github_id).set("Cookie", adminCookie);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should reject GET /user/gh/:ghId with no session", async () => {
        const res = await request(server).get("/user/gh/" + mockUser.github_id);
        expect(res.status).toBe(401);
    });

    // // not developed yet
    // it("Should create a new user", async () => {
    //     const res = await request(server).post("/user");
    //     const body: iResponse = JSON.parse(res.text);
    //     expect(res.status).toBe(403);
    //     expect(body.success).toBe(false);
    // });

    describe("PATCH /user/:userId", () => {
        const selfCookie = signedSidCookie(mockUser.id as string);
        const otherUserId = "223e4567-e89b-12d3-a456-426614174111";

        it("lets a user update their own profile", async () => {
            profilesRepoMock.upsert.mockResolvedValue({ user_id: mockUser.id, display_name: "Lena Ortiz" });
            usersRepoMock.getUserById.mockResolvedValue({ ...mockUser, display_name: "Lena Ortiz" });

            const res = await request(server)
                .patch("/user/" + mockUser.id)
                .set("Cookie", selfCookie)
                .send({ display_name: "Lena Ortiz" });
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockUser.id, { display_name: "Lena Ortiz" });
        });

        it("ignores fields outside the profile whitelist (e.g. role) rather than applying them", async () => {
            profilesRepoMock.upsert.mockResolvedValue({ user_id: mockUser.id });
            usersRepoMock.getUserById.mockResolvedValue(mockUser);

            const res = await request(server)
                .patch("/user/" + mockUser.id)
                .set("Cookie", selfCookie)
                .send({ display_name: "Lena Ortiz", role: "admin", is_active: false });

            expect(res.status).toBe(200);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockUser.id, { display_name: "Lena Ortiz" });
        });

        it("rejects a non-string display_name with 400", async () => {
            const res = await request(server)
                .patch("/user/" + mockUser.id)
                .set("Cookie", selfCookie)
                .send({ display_name: 12345 });
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(400);
            expect(body.success).toBe(false);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });

        it("rejects a non-boolean public_opt_in with 400", async () => {
            const res = await request(server)
                .patch("/user/" + mockUser.id)
                .set("Cookie", selfCookie)
                .send({ public_opt_in: "yes" });

            expect(res.status).toBe(400);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });

        it("rejects updating another user's profile when not an admin", async () => {
            usersRepoMock.getUserById.mockResolvedValue({ ...mockUser, role: "user" });

            const res = await request(server)
                .patch("/user/" + otherUserId)
                .set("Cookie", selfCookie)
                .send({ display_name: "Someone Else" });

            expect(res.status).toBe(403);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });

        it("lets an admin update another user's profile", async () => {
            usersRepoMock.getUserById.mockImplementation(async (userId: string) =>
                userId === mockUser.id ? mockUser : { id: otherUserId, github_id: 99, github_username: "other" },
            );
            profilesRepoMock.upsert.mockResolvedValue({ user_id: otherUserId, display_name: "Someone Else" });

            const res = await request(server)
                .patch("/user/" + otherUserId)
                .set("Cookie", adminCookie)
                .send({ display_name: "Someone Else" });

            expect(res.status).toBe(200);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(otherUserId, { display_name: "Someone Else" });
        });

        it("returns 404 when an admin targets a userId that doesn't exist", async () => {
            usersRepoMock.getUserById.mockImplementation(async (userId: string) =>
                userId === mockUser.id ? mockUser : undefined,
            );

            const res = await request(server)
                .patch("/user/" + otherUserId)
                .set("Cookie", adminCookie)
                .send({ display_name: "Someone Else" });

            expect(res.status).toBe(404);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(server).patch("/user/" + mockUser.id).send({ display_name: "Lena Ortiz" });
            expect(res.status).toBe(401);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });
    });

    // it("Should delete an existing user by id", async () => {
    //     const res = await request(server).delete("/user/" + mockUser.id);
    //     const body: iResponse = JSON.parse(res.text);
    //     expect(res.status).toBe(403);
    //     expect(body.success).toBe(false);
    // });
});
