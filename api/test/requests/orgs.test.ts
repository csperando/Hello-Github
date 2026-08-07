import { iResponse } from "../../models/response";
import request from "supertest";

import * as h from "../helpers";
const mockOrg = h.mockOrg;
const mockAdminUser = h.mockAdminUser;
const adminCookie = h.adminCookie;
const mockBasicUser = h.mockBasicUser;
const basicCookie = h.basicCookie;

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
    });

    // it("Should get all orgs", async () => {
    //     orgsRepoMock.getAllOrgs.mockResolvedValueOnce([mockOrg]);

    //     const res = await request(server).get("/org").set("Cookie", basicCookie);
    //     const body: iResponse = JSON.parse(res.text);
        
    //     expect(res.status).toBe(200);
    //     expect(body.success).toBe(true);
    //     expect(body.data).toEqual([mockOrg]);
    //     expect(orgsRepoMock.getAllOrgs).toHaveBeenCalledTimes(1);
    // });

    it("Should get an org by id", async () => {
        orgsRepoMock.getOrgById.mockResolvedValueOnce(mockOrg);

        const res = await request(server).get("/org/" + mockOrg.id).set("Cookie", basicCookie);
        const body: iResponse = JSON.parse(res.text);
        
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        // TODO expect(body.data)... 
        expect(orgsRepoMock.getOrgById).toHaveBeenCalledTimes(1);
    });

    it("Should reject with no session", async () => {
        const res = await request(server).get("/org");
        expect(res.status).toBe(401);
        expect(orgsRepoMock.searchOrgs).not.toHaveBeenCalled();
    });
});
