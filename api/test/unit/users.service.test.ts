import type { iUserRepo } from "../../repository/users.repo";
import type { iUserProfileRepo } from "../../repository/userProfiles.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

const profilesRepoMock = createMockRepoProxy<iUserProfileRepo>();
mockRepo("repository/userProfiles.repo", profilesRepoMock);

import { UserService } from "../../services/users.service";

describe("UserService.updateProfile", () => {
    let service: UserService;

    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();
        service = new UserService();
    });

    it("upserts the profile, then re-fetches and returns the merged user row", async () => {
        profilesRepoMock.upsert.mockResolvedValue({ user_id: "u1", display_name: "Lena" });
        usersRepoMock.getUserById.mockResolvedValue({
            id: "u1",
            github_username: "lena",
            display_name: "Lena",
            default_charity: null,
            public_opt_in: true,
        });

        const result = await service.updateProfile("u1", { display_name: "Lena" });

        expect(profilesRepoMock.upsert).toHaveBeenCalledWith("u1", { display_name: "Lena" });
        expect(usersRepoMock.getUserById).toHaveBeenCalledWith("u1");
        expect(result).toEqual({
            id: "u1",
            github_username: "lena",
            display_name: "Lena",
            default_charity: null,
            public_opt_in: true,
        });
    });

    it("propagates errors from the profile upsert without re-fetching the user", async () => {
        profilesRepoMock.upsert.mockRejectedValue(new Error("db down"));

        await expect(service.updateProfile("u1", { display_name: "Lena" })).rejects.toThrow("db down");
        expect(usersRepoMock.getUserById).not.toHaveBeenCalled();
    });
});
