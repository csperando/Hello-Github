import { iResponse } from "../../models/response";
import request from "supertest";

import { iUser } from "../../models/users";
const mockUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    github_id: 12,
    github_username: "csperando",
};

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
    });

    it("Should get all users", async () => {
        usersRepoMock.getAllUsers.mockResolvedValue([mockUser]);

        const res = await request(server).get("/user");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should get a user by id", async () => {
        usersRepoMock.getUserById.mockResolvedValue([mockUser]);

        const res = await request(server).get("/user/" + mockUser.id);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should get a user by GitHub id", async () => {
        usersRepoMock.getUserByGitHubId.mockResolvedValue([mockUser]);

        const res = await request(server).get("/user/gh/" + mockUser.github_id);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
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
