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
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

describe("User routes", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
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

    // it("Should update an existing user", async () => {
    //     const res = await request(server).patch("/user/" + mockUser.id);
    //     const body: iResponse = JSON.parse(res.text);
    //     expect(res.status).toBe(403);
    //     expect(body.success).toBe(false);
    // });

    // it("Should delete an existing user by id", async () => {
    //     const res = await request(server).delete("/user/" + mockUser.id);
    //     const body: iResponse = JSON.parse(res.text);
    //     expect(res.status).toBe(403);
    //     expect(body.success).toBe(false);
    // });
});
