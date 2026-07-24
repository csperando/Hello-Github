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

import type { iOrgsRepo } from "../../repository/orgs.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const orgsRepoMock = createMockRepoProxy<iOrgsRepo>();
mockRepo("repository/orgs.repo", orgsRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

describe("User routes", () => {

    beforeEach(() => {
        orgsRepoMock.__reset();
    });

    it("Should get all organizations", async () => {
        orgsRepoMock.getAllOrgs.mockResolvedValueOnce([mockOrg]);

        const res = await request(server).get("/org");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual([mockOrg]);
        expect(orgsRepoMock.getAllOrgs).toHaveBeenCalledTimes(1);
    });

    it("Should return a 500 status when db fails", async () => {
        orgsRepoMock.getAllOrgs.mockRejectedValueOnce(new Error("ECONNREFUSED"));

        const res = await request(server).get("/org");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(500);
        expect(body.success).toBe(false);
    });
});
