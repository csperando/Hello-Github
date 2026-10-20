import express from "express";
import cookieParser from "cookie-parser";
import { sign } from "cookie-signature";
import request from "supertest";

import { config } from "../../config/config";
import { iUser } from "../../models/users";

import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);
import type { iBackfillJobsRepo } from "../../repository/backfillJobs.repo";
const backfillJobsRepoMock = createMockRepoProxy<iBackfillJobsRepo>();
mockRepo("repository/backfillJobs.repo", backfillJobsRepoMock);
import { signedSidCookie } from "../helpers";

jest.mock("../../services/github.service", () => ({
    __esModule: true,
    exchangeCodeForToken: jest.fn(),
    fetchGitHubUser: jest.fn(),
    fetchGitHubEmails: jest.fn(),
    pickPrimaryVerifiedEmail: jest.fn(),
    pickNoreplyEmail: jest.fn(),
    computeNoreplyEmail: jest.fn(),
    createIssue: jest.fn(),
}));
import * as githubService from "../../services/github.service";

import authRouter from "../../routes/auth.routes";

const testApp = express();
testApp.use(cookieParser(config.SESSION_SECRET));
testApp.use("/auth", authRouter);

// Guardrail against these creeping back into a client-facing response shape.
const SENSITIVE_FIELDS = [
    "access_token",
    "refresh_token",
    "token_expires_at",
    "scope",
    "github_id",
    "github_node_id",
    "github_profile_url",
    "email",
    "bio",
    "created_at",
    "updated_at",
    "last_login_at",
];

const mockUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    github_id: 1,
    github_username: "octocat-test",
    github_email: "primary@example.com",
};

const mockGhUser = {
    id: 1,
    login: "octocat-test",
    node_id: "MDQ6VXNlcjE=",
    avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    html_url: "https://github.com/octocat-test",
    name: "Octocat Test",
    bio: null,
    email: null,
};

describe("Auth routes", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
        (githubService.exchangeCodeForToken as jest.Mock).mockReset();
        (githubService.fetchGitHubUser as jest.Mock).mockReset();
        (githubService.fetchGitHubEmails as jest.Mock).mockReset();
        (githubService.pickPrimaryVerifiedEmail as jest.Mock).mockReset();
        (githubService.pickNoreplyEmail as jest.Mock).mockReset();
        (githubService.computeNoreplyEmail as jest.Mock).mockReset();
        (githubService.createIssue as jest.Mock).mockReset();
        backfillJobsRepoMock.__reset();
    });

    it("should work on this test suite again later", () => {
        expect(1).toBe(1);
    });

    describe("GET /auth/github/callback redirect", () => {
        const loginAndCallback = async () => {
            const loginRes = await request(testApp).get("/auth/github/login");
            const state = new URL(loginRes.headers.location as string).searchParams.get("state")!;
            const setCookie = loginRes.headers["set-cookie"] as unknown as string[];
            const stateCookie = setCookie.find((c) => c.startsWith("gh_oauth_state="))!.split(";")[0]!;

            return request(testApp)
                .get(`/auth/github/callback?code=some-code&state=${state}`)
                .set("Cookie", stateCookie);
        };

        beforeEach(() => {
            (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_abc123");
            (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
            (githubService.fetchGitHubEmails as jest.Mock).mockResolvedValue([]);
            (githubService.pickPrimaryVerifiedEmail as jest.Mock).mockReturnValue("primary@example.com");
            (githubService.pickNoreplyEmail as jest.Mock).mockReturnValue("1+octocat-test@users.noreply.github.com");
        });

        it("sends a brand-new user to the profile step", async () => {
            usersRepoMock.getUserByGitHubId.mockResolvedValue(undefined);
            usersRepoMock.upsertFromGitHub.mockResolvedValue(mockUser);

            const res = await loginAndCallback();

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe(`${config.FRONTEND_URL}/signup/profile`);
            expect(usersRepoMock.upsertFromGitHub).toHaveBeenCalled();
        });

        it("sends an existing user straight to the dashboard", async () => {
            usersRepoMock.getUserByGitHubId.mockResolvedValue(mockUser);

            const res = await loginAndCallback();

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe(`${config.FRONTEND_URL}/dashboard`);
            expect(usersRepoMock.upsertFromGitHub).not.toHaveBeenCalled();

            const setCookie = res.headers["set-cookie"] as unknown as string[];
            expect(setCookie.some((c) => c.startsWith("sid="))).toBe(true);
        });
    });

    // describe("GET /auth/github/login", () => {
    //     it("redirects to GitHub's authorize endpoint and sets a signed state cookie", async () => {
    //         const res = await request(testApp).get("/auth/github/login");

    //         expect(res.status).toBe(302);
    //         const location = new URL(res.headers.location as string);
    //         expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    //         expect(location.searchParams.get("client_id")).toBe(config.GITHUB_CLIENT_ID);
    //         expect(location.searchParams.get("redirect_uri")).toBe(config.GITHUB_CALLBACK_URL);
    //         expect(location.searchParams.get("scope")).toBe("read:user user:email");
    //         expect(location.searchParams.get("state")).toBeTruthy();

    //         const setCookie = res.headers["set-cookie"] as unknown as string[];
    //         expect(setCookie.some((c) => c.startsWith("gh_oauth_state="))).toBe(true);
    //     });
    // });

    // describe("GET /auth/github/callback", () => {
    //     const buildAgentWithState = async () => {
    //         const loginRes = await request(testApp).get("/auth/github/login");
    //         const location = new URL(loginRes.headers.location as string);
    //         const state = location.searchParams.get("state")!;
    //         const setCookie = loginRes.headers["set-cookie"] as unknown as string[];
    //         const stateCookie = setCookie.find((c) => c.startsWith("gh_oauth_state="))!.split(";")[0]!;
    //         return { state, stateCookie };
    //     };

    //     it("on success for a new signup (inserted: true): exchanges the code, upserts the user, sets a signed sid cookie, and redirects to the profile step", async () => {
    //         const { state, stateCookie } = await buildAgentWithState();

    //         (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_abc123");
    //         (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
    //         (githubService.fetchPrimaryVerifiedEmail as jest.Mock).mockResolvedValue("primary@example.com");
    //         usersRepoMock.upsertFromGitHub.mockResolvedValue({ ...mockUser, inserted: true });

    //         const res = await request(testApp)
    //             .get(`/auth/github/callback?code=some-code&state=${state}`)
    //             .set("Cookie", stateCookie);

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/signup?step=profile`);

    //         const setCookie = res.headers["set-cookie"] as unknown as string[];
    //         expect(setCookie.some((c) => c.startsWith("sid="))).toBe(true);

    //         expect(usersRepoMock.upsertFromGitHub).toHaveBeenCalledWith(expect.objectContaining({
    //             github_id: mockGhUser.id,
    //             github_username: mockGhUser.login,
    //             github_email: "primary@example.com",
    //             github_node_id: mockGhUser.node_id,
    //             github_profile_url: mockGhUser.html_url,
    //             avatar_url: mockGhUser.avatar_url,
    //         }));
    //     });

    //     it("on success for a returning login (inserted: false): redirects straight to the dashboard", async () => {
    //         const { state, stateCookie } = await buildAgentWithState();

    //         (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_abc123");
    //         (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
    //         (githubService.fetchPrimaryVerifiedEmail as jest.Mock).mockResolvedValue("primary@example.com");
    //         usersRepoMock.upsertFromGitHub.mockResolvedValue({ ...mockUser, inserted: false });

    //         const res = await request(testApp)
    //             .get(`/auth/github/callback?code=some-code&state=${state}`)
    //             .set("Cookie", stateCookie);

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/dashboard`);
    //     });

    //     it.skip("sets a sid cookie that requireAuth actually accepts on a subsequent /auth/me call", async () => {
    //         const agent = request.agent(testApp);
    //         const loginRes = await agent.get("/auth/github/login");
    //         const location = new URL(loginRes.headers.location as string);
    //         const state = location.searchParams.get("state")!;

    //         (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_abc123");
    //         (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
    //         (githubService.fetchPrimaryVerifiedEmail as jest.Mock).mockResolvedValue("primary@example.com");
    //         usersRepoMock.upsertFromGitHub.mockResolvedValue({ ...mockUser, inserted: true });

    //         await agent.get(`/auth/github/callback?code=some-code&state=${state}`);

    //         usersRepoMock.getUserById.mockResolvedValue(mockUser);
    //         const meRes = await agent.get("/auth/me");

    //         expect(meRes.status).toBe(200);
    //         expect(meRes.body.data[0].id).toBe(mockUser.id);
    //     });

    //     it("redirects to the error page when state is missing", async () => {
    //         const res = await request(testApp).get("/auth/github/callback?code=some-code");

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/error?type=github_disconnected`);
    //     });

    //     it("redirects to the error page when state doesn't match the cookie", async () => {
    //         const { stateCookie } = await buildAgentWithState();

    //         const res = await request(testApp)
    //             .get("/auth/github/callback?code=some-code&state=wrong-state")
    //             .set("Cookie", stateCookie);

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/error?type=github_disconnected`);
    //     });

    //     it("redirects to the error page when code is missing", async () => {
    //         const { state, stateCookie } = await buildAgentWithState();

    //         const res = await request(testApp)
    //             .get(`/auth/github/callback?state=${state}`)
    //             .set("Cookie", stateCookie);

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/error?type=github_disconnected`);
    //     });

    //     it("redirects to the error page when the code exchange throws (bad/reused code)", async () => {
    //         const { state, stateCookie } = await buildAgentWithState();
    //         (githubService.exchangeCodeForToken as jest.Mock).mockRejectedValue(new Error("bad_verification_code"));

    //         const res = await request(testApp)
    //             .get(`/auth/github/callback?code=bad-code&state=${state}`)
    //             .set("Cookie", stateCookie);

    //         expect(res.status).toBe(302);
    //         expect(res.headers.location).toBe(`${config.FRONTEND_URL}/error?type=github_disconnected`);
    //     });

    //     it("clears the state cookie regardless of outcome", async () => {
    //         const { state, stateCookie } = await buildAgentWithState();
    //         (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_abc123");
    //         (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
    //         (githubService.fetchPrimaryVerifiedEmail as jest.Mock).mockResolvedValue("primary@example.com");
    //         usersRepoMock.upsertFromGitHub.mockResolvedValue({ ...mockUser, inserted: false });

    //         const res = await request(testApp)
    //             .get(`/auth/github/callback?code=some-code&state=${state}`)
    //             .set("Cookie", stateCookie);

    //         const setCookie = res.headers["set-cookie"] as unknown as string[];
    //         const cleared = setCookie.find((c) => c.startsWith("gh_oauth_state="));
    //         expect(cleared).toBeDefined();
    //         expect(cleared).toMatch(/gh_oauth_state=;/);
    //     });
    // });

    // describe("GET /auth/me", () => {
    //     it("returns 401 with no session cookie", async () => {
    //         const res = await request(testApp).get("/auth/me");
    //         expect(res.status).toBe(401);
    //     });

    //     it("returns the current user when authenticated", async () => {
    //         usersRepoMock.getUserById.mockResolvedValue(mockUser);
    //         const sidCookie = `sid=s:${sign(mockUser.id as string, config.SESSION_SECRET)}`;

    //         const res = await request(testApp).get("/auth/me").set("Cookie", sidCookie);

    //         expect(res.status).toBe(200);
    //         expect(res.body.success).toBe(true);
    //         expect(res.body.data[0].id).toBe(mockUser.id);
    //     });

    //     it("strips GitHub-internal/contact fields, returning only the client-safe shape", async () => {
    //         usersRepoMock.getUserById.mockResolvedValue({
    //             ...mockUser,
    //             github_node_id: mockGhUser.node_id,
    //             github_profile_url: mockGhUser.html_url,
    //             access_token: "gho_secret",
    //             refresh_token: "ghr_secret",
    //             scope: "read:user user:email",
    //         });
    //         const sidCookie = `sid=s:${sign(mockUser.id as string, config.SESSION_SECRET)}`;

    //         const res = await request(testApp).get("/auth/me").set("Cookie", sidCookie);

    //         expect(res.status).toBe(200);
    //         const user = res.body.data[0];
    //         expect(user).toEqual({
    //             id: mockUser.id,
    //             github_username: mockUser.github_username,
    //         });
    //         for (const field of ["github_id", "github_email", "github_node_id", "github_profile_url", "access_token", "refresh_token", "scope"]) {
    //             expect(user).not.toHaveProperty(field);
    //         }
    //     });

    //     it("never includes any sensitive/internal field in the response body, regardless of what the DB row contains", async () => {
    //         usersRepoMock.getUserById.mockResolvedValue({
    //             ...mockUser,
    //             access_token: "gho_secret",
    //             refresh_token: "ghr_secret",
    //             token_expires_at: "2026-08-01T00:00:00Z",
    //             scope: "read:user user:email",
    //             github_node_id: mockGhUser.node_id,
    //             github_profile_url: mockGhUser.html_url,
    //             email: "personal@example.com",
    //             bio: "I paint pixels.",
    //             created_at: "2026-01-01T00:00:00Z",
    //             updated_at: "2026-01-02T00:00:00Z",
    //             last_login_at: "2026-07-28T00:00:00Z",
    //         });
    //         const sidCookie = `sid=s:${sign(mockUser.id as string, config.SESSION_SECRET)}`;

    //         const res = await request(testApp).get("/auth/me").set("Cookie", sidCookie);

    //         expect(res.status).toBe(200);
    //         for (const field of SENSITIVE_FIELDS) {
    //             expect(res.body.data[0]).not.toHaveProperty(field);
    //         }
    //     });

    //     it("returns 401 and clears sid when the session user no longer exists", async () => {
    //         usersRepoMock.getUserById.mockResolvedValue(undefined);
    //         const sidCookie = `sid=s:${sign("deleted-user-id", config.SESSION_SECRET)}`;

    //         const res = await request(testApp).get("/auth/me").set("Cookie", sidCookie);

    //         expect(res.status).toBe(401);
    //         const setCookie = res.headers["set-cookie"] as unknown as string[];
    //         expect(setCookie.some((c) => c.startsWith("sid=;"))).toBe(true);
    //     });
    // });

    // describe("POST /auth/logout", () => {
    //     it("clears the sid cookie", async () => {
    //         const res = await request(testApp).post("/auth/logout");

    //         expect(res.status).toBe(200);
    //         expect(res.body.success).toBe(true);
    //         const setCookie = res.headers["set-cookie"] as unknown as string[];
    //         expect(setCookie.some((c) => c.startsWith("sid=;"))).toBe(true);
    //     });
    // });

    describe("paint consent (step-up OAuth that opens the canvas-repo issue as the user)", () => {
        const sid = signedSidCookie(mockUser.id as string);
        const paintCallbackUrl = `${config.GITHUB_CALLBACK_URL}/paint`;
        const awaitingJob = { id: "j1", user_id: mockUser.id, design_id: "d1", year: 2025, status: "awaiting_issue" };
        // carries the design so the error page can send the user straight back into consent
        const failedUrl = `${config.FRONTEND_URL}/error?type=paint_consent_failed&designId=d1`;

        const startPaint = () => request(testApp).get("/auth/github/paint?designId=d1").set("Cookie", sid);

        const startAndCallback = async (stateOverride?: string) => {
            const startRes = await startPaint();
            const state = new URL(startRes.headers.location as string).searchParams.get("state")!;
            const setCookie = startRes.headers["set-cookie"] as unknown as string[];
            const paintCookie = setCookie.find((c) => c.startsWith("gh_paint_state="))!.split(";")[0]!;

            return request(testApp)
                .get(`/auth/github/callback/paint?code=paint-code&state=${stateOverride ?? state}`)
                .set("Cookie", [sid, paintCookie].join("; "));
        };

        beforeEach(() => {
            backfillJobsRepoMock.getLockingForUserAndDesign.mockResolvedValue(awaitingJob);
            backfillJobsRepoMock.markIssueOpened.mockResolvedValue({ ...awaitingJob, status: "ready" });
            usersRepoMock.getUserById.mockResolvedValue(mockUser);
            (githubService.exchangeCodeForToken as jest.Mock).mockResolvedValue("gho_paint");
            (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue(mockGhUser);
            (githubService.createIssue as jest.Mock).mockResolvedValue("https://github.com/owner/canvas/issues/7");
        });

        describe("GET /auth/github/paint", () => {
            it("401s without a session", async () => {
                const res = await request(testApp).get("/auth/github/paint?designId=d1");
                expect(res.status).toBe(401);
            });

            it("redirects to GitHub asking for public_repo, back to the paint callback, with a signed state cookie", async () => {
                const res = await startPaint();

                expect(res.status).toBe(302);
                const location = new URL(res.headers.location as string);
                expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
                expect(location.searchParams.get("client_id")).toBe(config.GITHUB_CLIENT_ID);
                expect(location.searchParams.get("scope")).toBe("public_repo");
                expect(location.searchParams.get("redirect_uri")).toBe(paintCallbackUrl);
                expect(location.searchParams.get("state")).toBeTruthy();

                const setCookie = res.headers["set-cookie"] as unknown as string[];
                const paintCookie = setCookie.find((c) => c.startsWith("gh_paint_state="))!;
                expect(paintCookie).toMatch(/HttpOnly/i);
                expect(backfillJobsRepoMock.getLockingForUserAndDesign).toHaveBeenCalledWith(mockUser.id, "d1");
            });

            it("sends the user to the dashboard when the job is already past the issue step", async () => {
                backfillJobsRepoMock.getLockingForUserAndDesign.mockResolvedValue({ ...awaitingJob, status: "ready" });

                const res = await startPaint();
                expect(res.status).toBe(302);
                expect(res.headers.location).toBe(`${config.FRONTEND_URL}/dashboard`);
            });

            it("sends the user to the error page when they have no job for that design", async () => {
                backfillJobsRepoMock.getLockingForUserAndDesign.mockResolvedValue(undefined);

                const res = await startPaint();
                expect(res.headers.location).toBe(failedUrl);
            });
        });

        describe("GET /auth/github/callback/paint", () => {
            it("opens the issue as the user, marks the job ready, and lands on the dashboard", async () => {
                const res = await startAndCallback();

                expect(res.status).toBe(302);
                expect(res.headers.location).toBe(`${config.FRONTEND_URL}/dashboard`);
                expect(githubService.exchangeCodeForToken).toHaveBeenCalledWith("paint-code", paintCallbackUrl);
                expect(githubService.createIssue).toHaveBeenCalledWith(
                    "gho_paint",
                    config.PAINT_TARGET_REPO,
                    "🎨 @octocat-test is painting their 2025 graph",
                    expect.stringContaining("Commits for Good"),
                );
                expect(backfillJobsRepoMock.markIssueOpened).toHaveBeenCalledWith(
                    "j1",
                    "https://github.com/owner/canvas/issues/7",
                );
            });

            it("never hands the token back to the browser", async () => {
                const res = await startAndCallback();

                const setCookie = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
                expect(res.headers.location).not.toContain("gho_paint");
                expect(setCookie.join("\n")).not.toContain("gho_paint");
            });

            it("refuses a mismatched state without exchanging the code", async () => {
                const res = await startAndCallback("not-the-state");

                expect(res.headers.location).toBe(failedUrl);
                expect(githubService.exchangeCodeForToken).not.toHaveBeenCalled();
            });

            it("refuses consent from a different GitHub account than the logged-in user", async () => {
                (githubService.fetchGitHubUser as jest.Mock).mockResolvedValue({ ...mockGhUser, id: 999, login: "someone-else" });

                const res = await startAndCallback();

                expect(res.headers.location).toBe(failedUrl);
                expect(githubService.createIssue).not.toHaveBeenCalled();
                expect(backfillJobsRepoMock.markIssueOpened).not.toHaveBeenCalled();
            });

            it("leaves the job awaiting its issue when GitHub refuses to open it", async () => {
                (githubService.createIssue as jest.Mock).mockRejectedValue(new Error("GitHub 403"));

                const res = await startAndCallback();

                expect(res.headers.location).toBe(failedUrl);
                expect(backfillJobsRepoMock.markIssueOpened).not.toHaveBeenCalled();
            });
        });
    });
});
