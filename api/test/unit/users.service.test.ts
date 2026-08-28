import type { iUserRepo } from "../../repository/users.repo";
import type { iUserProfileRepo } from "../../repository/userProfiles.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

const profilesRepoMock = createMockRepoProxy<iUserProfileRepo>();
mockRepo("repository/userProfiles.repo", profilesRepoMock);

const mockRefreshForUser = jest.fn();
jest.mock("../../services/contributionRefresh.service", () => ({
    __esModule: true,
    ContributionRefreshService: jest.fn().mockImplementation(() => ({
        refreshForUser: mockRefreshForUser,
    })),
}));

import { UserService } from "../../services/users.service";
import { iGitHubUpsertInput } from "../../models/users";

describe("UserService.updateProfile", () => {
    let service: UserService;

    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();
        service = new UserService();
        usersRepoMock.updateEmailPreference.mockResolvedValue({});
    });

    it("upserts the profile, then re-fetches and returns the merged user row", async () => {
        profilesRepoMock.upsert.mockResolvedValue({ user_id: "u1", display_name: "Lena" });
        usersRepoMock.getUserById.mockResolvedValue({
            id: "u1",
            github_id: 42,
            github_username: "lena",
            github_email: "lena@example.com",
            github_noreply_email: "42+lena@users.noreply.github.com",
            display_name: "Lena",
            default_charity: null,
            public_opt_in: true,
            use_real_email: false,
        });

        const result = await service.updateProfile("u1", { display_name: "Lena" });

        expect(profilesRepoMock.upsert).toHaveBeenCalledWith("u1", { display_name: "Lena" });
        expect(usersRepoMock.getUserById).toHaveBeenCalledWith("u1");
        expect(result).toEqual(expect.objectContaining({
            id: "u1",
            github_username: "lena",
            display_name: "Lena",
            default_charity: null,
            public_opt_in: true,
        }));
    });

    it("propagates errors from the profile upsert without re-fetching the user", async () => {
        profilesRepoMock.upsert.mockRejectedValue(new Error("db down"));

        await expect(service.updateProfile("u1", { display_name: "Lena" })).rejects.toThrow("db down");
        expect(usersRepoMock.getUserById).not.toHaveBeenCalled();
    });

    describe("email preference sync", () => {
        beforeEach(() => {
            profilesRepoMock.upsert.mockResolvedValue({});
        });

        it("uses the real github_email when use_real_email is true", async () => {
            usersRepoMock.getUserById.mockResolvedValue({
                id: "u1",
                github_id: 42,
                github_username: "lena",
                github_email: "lena@real.com",
                github_noreply_email: "42+lena@users.noreply.github.com",
                use_real_email: true,
            });

            const result = await service.updateProfile("u1", {});

            expect(usersRepoMock.updateEmailPreference).toHaveBeenCalledWith("u1", "lena@real.com");
            expect(result.email).toBe("lena@real.com");
        });

        it("uses the stored github_noreply_email when use_real_email is false", async () => {
            usersRepoMock.getUserById.mockResolvedValue({
                id: "u1",
                github_id: 42,
                github_username: "lena",
                github_email: "lena@real.com",
                github_noreply_email: "42+lena@users.noreply.github.com",
                use_real_email: false,
            });

            const result = await service.updateProfile("u1", {});

            expect(usersRepoMock.updateEmailPreference).toHaveBeenCalledWith("u1", "42+lena@users.noreply.github.com");
            expect(result.email).toBe("42+lena@users.noreply.github.com");
        });

        it("falls back to computeNoreplyEmail when github_noreply_email is absent on the row", async () => {
            usersRepoMock.getUserById.mockResolvedValue({
                id: "u1",
                github_id: 42,
                github_username: "lena",
                github_email: "lena@real.com",
                use_real_email: false,
            });

            const result = await service.updateProfile("u1", {});

            expect(usersRepoMock.updateEmailPreference).toHaveBeenCalledWith("u1", "42+lena@users.noreply.github.com");
            expect(result.email).toBe("42+lena@users.noreply.github.com");
        });
    });
});

describe("UserService.upsertFromGitHub", () => {
    let service: UserService;

    const input: iGitHubUpsertInput = {
        github_id: 42,
        github_username: "lena",
        github_email: "lena@example.com",
        github_noreply_email: "42+lena@users.noreply.github.com",
        github_node_id: "MDQ6VXNlcjQy",
        github_profile_url: "https://github.com/lena",
        avatar_url: "https://avatars.githubusercontent.com/u/42?v=4",
    };

    beforeEach(() => {
        usersRepoMock.__reset();
        mockRefreshForUser.mockReset();
        service = new UserService();
    });

    it("returns the upserted user without waiting on the contribution refresh", async () => {
        usersRepoMock.upsertFromGitHub.mockResolvedValue({ id: "u1", github_username: "lena" });
        // never resolves within the test - proves upsertFromGitHub doesn't await it
        mockRefreshForUser.mockReturnValue(new Promise(() => {}));

        const result = await service.upsertFromGitHub(input);

        expect(result).toEqual({ id: "u1", github_username: "lena" });
    });

    it("triggers a best-effort contribution refresh for the upserted user", async () => {
        usersRepoMock.upsertFromGitHub.mockResolvedValue({ id: "u1", github_username: "lena" });
        mockRefreshForUser.mockResolvedValue({});

        await service.upsertFromGitHub(input);

        expect(mockRefreshForUser).toHaveBeenCalledWith("u1", "lena");
    });

    it("doesn't let a failed refresh reject upsertFromGitHub or throw unhandled", async () => {
        usersRepoMock.upsertFromGitHub.mockResolvedValue({ id: "u1", github_username: "lena" });
        mockRefreshForUser.mockRejectedValue(new Error("GitHub unreachable"));

        await expect(service.upsertFromGitHub(input)).resolves.toEqual({ id: "u1", github_username: "lena" });
    });

    it("propagates a failure from the users repo upsert itself", async () => {
        usersRepoMock.upsertFromGitHub.mockRejectedValue(new Error("db down"));

        await expect(service.upsertFromGitHub(input)).rejects.toThrow("db down");
        expect(mockRefreshForUser).not.toHaveBeenCalled();
    });
});
