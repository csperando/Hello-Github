import {
    exchangeCodeForToken,
    fetchGitHubUser,
    fetchPrimaryVerifiedEmail,
} from "../../services/github.service";

const mockFetchResponse = (body: any, ok = true, status = 200) => ({
    ok,
    status,
    json: async () => body,
});

describe("github.service", () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe("exchangeCodeForToken", () => {
        it("returns the access token on success", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({
                access_token: "gho_abc123",
                token_type: "bearer",
                scope: "read:user,user:email",
            }) as any);

            const token = await exchangeCodeForToken("some-code");
            expect(token).toBe("gho_abc123");
        });

        it("throws when GitHub returns a 200 with an error payload (bad/reused code)", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({
                error: "bad_verification_code",
                error_description: "The code passed is incorrect or expired.",
            }) as any);

            await expect(exchangeCodeForToken("bad-code")).rejects.toThrow(/incorrect or expired/i);
        });

        it("throws when the HTTP response itself is not ok", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({}, false, 500) as any);

            await expect(exchangeCodeForToken("some-code")).rejects.toThrow();
        });
    });

    describe("fetchGitHubUser", () => {
        it("returns the parsed GitHub user", async () => {
            const ghUser = {
                id: 1,
                login: "octocat-test",
                node_id: "MDQ6VXNlcjE=",
                avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
                html_url: "https://github.com/octocat-test",
                name: "Octocat Test",
                bio: null,
                email: null,
            };
            fetchSpy.mockResolvedValue(mockFetchResponse(ghUser) as any);

            const user = await fetchGitHubUser("gho_abc123");
            expect(user).toEqual(ghUser);

            const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gho_abc123");
        });

        it("throws when the request fails", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({}, false, 401) as any);

            await expect(fetchGitHubUser("bad-token")).rejects.toThrow();
        });
    });

    describe("fetchPrimaryVerifiedEmail", () => {
        it("returns the primary verified email", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse([
                { email: "secondary@example.com", primary: false, verified: true, visibility: null },
                { email: "unverified@example.com", primary: true, verified: false, visibility: null },
                { email: "primary@example.com", primary: true, verified: true, visibility: "public" },
            ]) as any);

            const email = await fetchPrimaryVerifiedEmail("gho_abc123");
            expect(email).toBe("primary@example.com");
        });

        it("throws when no verified primary email exists", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse([
                { email: "unverified@example.com", primary: true, verified: false, visibility: null },
            ]) as any);

            await expect(fetchPrimaryVerifiedEmail("gho_abc123")).rejects.toThrow(/no verified primary email/i);
        });

        it("throws when the request fails", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({}, false, 401) as any);

            await expect(fetchPrimaryVerifiedEmail("bad-token")).rejects.toThrow();
        });
    });
});
