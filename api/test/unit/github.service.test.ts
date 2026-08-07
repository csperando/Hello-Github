import {
    exchangeCodeForToken,
    fetchGitHubUser,
    fetchGitHubEmails,
    pickPrimaryVerifiedEmail,
    pickNoreplyEmail,
    computeNoreplyEmail,
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

    describe("fetchGitHubEmails", () => {
        it("returns the parsed emails array", async () => {
            const emails = [
                { email: "secondary@example.com", primary: false, verified: true, visibility: null },
                { email: "primary@example.com", primary: true, verified: true, visibility: "public" },
            ];
            fetchSpy.mockResolvedValue(mockFetchResponse(emails) as any);

            expect(await fetchGitHubEmails("gho_abc123")).toEqual(emails);

            const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gho_abc123");
        });

        it("throws when the request fails", async () => {
            fetchSpy.mockResolvedValue(mockFetchResponse({}, false, 401) as any);

            await expect(fetchGitHubEmails("bad-token")).rejects.toThrow();
        });
    });

    describe("pickPrimaryVerifiedEmail", () => {
        it("returns the primary verified email", () => {
            const email = pickPrimaryVerifiedEmail([
                { email: "secondary@example.com", primary: false, verified: true, visibility: null },
                { email: "unverified@example.com", primary: true, verified: false, visibility: null },
                { email: "primary@example.com", primary: true, verified: true, visibility: "public" },
            ]);
            expect(email).toBe("primary@example.com");
        });

        it("throws when no verified primary email exists", () => {
            expect(() => pickPrimaryVerifiedEmail([
                { email: "unverified@example.com", primary: true, verified: false, visibility: null },
            ])).toThrow(/no verified primary email/i);
        });
    });

    describe("pickNoreplyEmail", () => {
        it("finds a noreply-shaped entry in the emails array", () => {
            const email = pickNoreplyEmail([
                { email: "personal@example.com", primary: true, verified: true, visibility: "public" },
                { email: "583231+octocat@users.noreply.github.com", primary: false, verified: true, visibility: null },
            ]);
            expect(email).toBe("583231+octocat@users.noreply.github.com");
        });

        it("returns undefined when no email matches the noreply pattern", () => {
            const email = pickNoreplyEmail([
                { email: "personal@example.com", primary: true, verified: true, visibility: "public" },
            ]);
            expect(email).toBeUndefined();
        });
    });

    describe("computeNoreplyEmail", () => {
        it("formats {id}+{username}@users.noreply.github.com", () => {
            expect(computeNoreplyEmail(583231, "octocat")).toBe("583231+octocat@users.noreply.github.com");
        });

        it("is deterministic for the same inputs", () => {
            expect(computeNoreplyEmail(1, "a")).toBe(computeNoreplyEmail(1, "a"));
        });

        it("differs for different usernames with the same id (shouldn't happen, but not silently collide)", () => {
            expect(computeNoreplyEmail(1, "a")).not.toBe(computeNoreplyEmail(1, "b"));
        });
    });
});
