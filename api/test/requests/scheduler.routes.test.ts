import { iResponse } from "../../models/response";
import request from "supertest";

import { config } from "../../config/config";

import type { iSchedulerRepo } from "../../repository/scheduler.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const schedulerRepoMock = createMockRepoProxy<iSchedulerRepo>();
mockRepo("repository/scheduler.repo", schedulerRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

const apiKeyHeader = { "X-API-Key": config.SCHEDULER_API_KEY };

function mockCandidate(overrides: Record<string, unknown> = {}) {
    return {
        user_id: "u1",
        github_id: 583231,
        github_username: "octocat",
        github_email: "octocat@example.com",
        use_real_email: false,
        timezone: "UTC",
        design_id: "d1",
        pattern: [0, 1, 2, 3, 4, 0, 0],
        start_date: "2026-01-04",
        repeat_indefinitely: false,
        recurrence_end_date: null,
        target_date: "2026-01-07",
        ...overrides,
    };
}

describe("Scheduler routes", () => {
    beforeEach(() => {
        schedulerRepoMock.__reset();
        runLogRepoMock.__reset();
    });

    describe("GET /scheduler/due", () => {
        it("rejects a request with no API key", async () => {
            const res = await request(server).get("/scheduler/due");
            expect(res.status).toBe(401);
            expect(schedulerRepoMock.findDueCandidates).not.toHaveBeenCalled();
        });

        it("rejects a request with the wrong API key", async () => {
            const res = await request(server).get("/scheduler/due").set("X-API-Key", "wrong");
            expect(res.status).toBe(401);
        });

        it("returns due commits with the correct API key", async () => {
            schedulerRepoMock.findDueCandidates.mockResolvedValue([mockCandidate()]);

            const res = await request(server).get("/scheduler/due").set(apiKeyHeader);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.data).toHaveLength(1);
            const entry = body.data![0] as any;
            expect(entry.user_id).toBe("u1");
            expect(entry.github_username).toBe("octocat");
            expect(entry.commit_author_email).toBe("583231+octocat@users.noreply.github.com");
            expect(entry.commit_count).toBe(8); // intensity 3
            expect(entry.commit_timestamp).toBe("2026-01-07T01:00:00.000Z");
        });

        it("never includes email or other PII beyond github_id/github_username", async () => {
            schedulerRepoMock.findDueCandidates.mockResolvedValue([mockCandidate()]);

            const res = await request(server).get("/scheduler/due").set(apiKeyHeader);
            const body: iResponse = JSON.parse(res.text);
            const entry = body.data![0] as any;

            expect(entry).not.toHaveProperty("github_email");
            expect(entry).not.toHaveProperty("timezone");
            expect(entry).not.toHaveProperty("use_real_email");
        });

        it("returns an empty array when nobody is due", async () => {
            schedulerRepoMock.findDueCandidates.mockResolvedValue([]);

            const res = await request(server).get("/scheduler/due").set(apiKeyHeader);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.data).toEqual([]);
        });
    });

    describe("POST /scheduler/due/complete", () => {
        const validBody = [{ user_id: "u1", target_date: "2026-01-04", commit_count: 5, status: "committed" }];

        it("rejects a request with no API key", async () => {
            const res = await request(server).post("/scheduler/due/complete").send(validBody);
            expect(res.status).toBe(401);
            expect(runLogRepoMock.create).not.toHaveBeenCalled();
        });

        it("records each report with the correct API key", async () => {
            runLogRepoMock.create.mockResolvedValue({ id: "r1", status: "committed" });

            const res = await request(server)
                .post("/scheduler/due/complete")
                .set(apiKeyHeader)
                .send(validBody);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(runLogRepoMock.create).toHaveBeenCalledWith({
                user_id: "u1",
                target_date: "2026-01-04",
                commit_count: 5,
                status: "committed",
            });
        });

        it("rejects an invalid body with 400 and never calls the repo", async () => {
            const res = await request(server)
                .post("/scheduler/due/complete")
                .set(apiKeyHeader)
                .send([{ user_id: "u1", target_date: "2026-01-04", commit_count: 5, status: "bogus" }]);

            expect(res.status).toBe(400);
            expect(runLogRepoMock.create).not.toHaveBeenCalled();
        });

        it("processes multiple reports in one call", async () => {
            runLogRepoMock.create.mockResolvedValue({ id: "r1" });

            const res = await request(server)
                .post("/scheduler/due/complete")
                .set(apiKeyHeader)
                .send([
                    { user_id: "u1", target_date: "2026-01-04", commit_count: 5, status: "committed" },
                    { user_id: "u2", target_date: "2026-01-04", commit_count: 0, status: "failed" },
                ]);

            expect(res.status).toBe(200);
            expect(runLogRepoMock.create).toHaveBeenCalledTimes(2);
        });

        it("surfaces a UNIQUE(user_id, target_date) conflict as a server error rather than silently succeeding", async () => {
            const err: any = new Error("duplicate key value violates unique constraint");
            err.code = "23505";
            runLogRepoMock.create.mockRejectedValue(err);

            const res = await request(server)
                .post("/scheduler/due/complete")
                .set(apiKeyHeader)
                .send(validBody);

            expect(res.status).toBe(500);
        });
    });
});
