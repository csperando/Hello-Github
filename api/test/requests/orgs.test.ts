import { iResponse } from "../../models/response";
import request from "supertest";

import { iOrg } from "../../models/orgs";
const mockOrg: iOrg = {
    id: 1,
    ein: "12-3456789",
    name: "Test Org",
    street: "123 Main St",
    city: "Testopolis",
    state: "TN",
    zip: "12345",
};

import { iUser } from "../../models/users";
import { signedSidCookie } from "../helpers";
const mockAdmin: iUser = {
    id: "323e4567-e89b-12d3-a456-426614174002",
    github_id: 99,
    github_username: "org-admin",
    role: "admin",
    is_active: true,
};
const adminCookie = signedSidCookie(mockAdmin.id as string);

import type { iOrgsRepo } from "../../repository/orgs.repo";
import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const orgsRepoMock = createMockRepoProxy<iOrgsRepo>();
mockRepo("repository/orgs.repo", orgsRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

describe("Org routes", () => {

    beforeEach(() => {
        orgsRepoMock.__reset();
        usersRepoMock.__reset();
        // satisfies requireRole's lookup of the requesting (admin) user
        usersRepoMock.getUserById.mockResolvedValue(mockAdmin);
    });

    it("Should get all organizations", async () => {
        orgsRepoMock.getAllOrgs.mockResolvedValueOnce([mockOrg]);

        const res = await request(server).get("/org").set("Cookie", adminCookie);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual([mockOrg]);
        expect(orgsRepoMock.getAllOrgs).toHaveBeenCalledTimes(1);
    });

    it("Should return a 500 status when db fails", async () => {
        orgsRepoMock.getAllOrgs.mockRejectedValueOnce(new Error("ECONNREFUSED"));

        const res = await request(server).get("/org").set("Cookie", adminCookie);
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(500);
        expect(body.success).toBe(false);
    });

    it("Should reject with no session", async () => {
        const res = await request(server).get("/org");
        expect(res.status).toBe(401);
        expect(orgsRepoMock.getAllOrgs).not.toHaveBeenCalled();
    });

    it("Should reject a non-admin role", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockAdmin, role: "user" });

        const res = await request(server).get("/org").set("Cookie", adminCookie);
        expect(res.status).toBe(403);
        expect(orgsRepoMock.getAllOrgs).not.toHaveBeenCalled();
    });

    it("Should reject an inactive admin account", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockAdmin, is_active: false });

        const res = await request(server).get("/org").set("Cookie", adminCookie);
        expect(res.status).toBe(403);
        expect(orgsRepoMock.getAllOrgs).not.toHaveBeenCalled();
    });
});
