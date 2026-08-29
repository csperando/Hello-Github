import { iResponse } from "../../models/response";
import request from "supertest";

import { config } from "../../config/config";

import type { iUsersContributionsRepo } from "../../repository/usersContributions.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const contributionsRepoMock = createMockRepoProxy<iUsersContributionsRepo>();
mockRepo("repository/usersContributions.repo", contributionsRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);

jest.mock("../../services/github.service", () => ({
    __esModule: true,
    fetchContributionCalendar: jest.fn(),
}));

import server from "../server";

afterAll(() => {
    server.close();
});

const apiKeyHeader = { "X-API-Key": config.SCHEDULER_API_KEY };

describe("POST /contributions/refresh", () => {
    beforeEach(() => {
        contributionsRepoMock.__reset();
        runLogRepoMock.__reset();
    });

    it("rejects a request with no API key", async () => {
        const res = await request(server).post("/contributions/refresh");
        expect(res.status).toBe(401);
        expect(contributionsRepoMock.findActiveUsers).not.toHaveBeenCalled();
    });

    it("rejects a request with the wrong API key", async () => {
        const res = await request(server).post("/contributions/refresh").set("X-API-Key", "wrong");
        expect(res.status).toBe(401);
    });

    it("refreshes active users and returns a summary with the correct API key", async () => {
        contributionsRepoMock.findActiveUsers.mockResolvedValue([]);

        const res = await request(server).post("/contributions/refresh").set(apiKeyHeader);
        const body: iResponse = JSON.parse(res.text);

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual([{ refreshed: 0, failed: 0 }]);
        expect(contributionsRepoMock.findActiveUsers).toHaveBeenCalled();
    });
});
