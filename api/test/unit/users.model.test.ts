import { toPublicUser } from "../../models/users";

describe("toPublicUser", () => {
    const fullUser = {
        id: "11111111-1111-1111-1111-111111111111",
        github_id: 42,
        github_username: "lena",
        github_email: "lena@example.com",
        github_node_id: 8675309,
        github_profile_url: "https://github.com/lena",
        avatar_url: "https://avatars.example/lena.png",
        email: "lena@personal.example",
        name: "Lena Ortiz",
        bio: "I paint pixels.",
        role: "user",
        is_active: true,
        access_token: "gho_secret",
        refresh_token: "ghr_secret",
        token_expires_at: "2026-08-01T00:00:00Z",
        scope: "read:user user:email",
        display_name: "Lena",
        default_charity: "EFF",
        public_opt_in: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        last_login_at: "2026-07-28T00:00:00Z",
    } as const;

    it("keeps only the fields safe to return to a non-admin client", () => {
        const result = toPublicUser(fullUser);

        expect(result).toEqual({
            id: fullUser.id,
            github_username: fullUser.github_username,
            avatar_url: fullUser.avatar_url,
            name: fullUser.name,
            display_name: fullUser.display_name,
            default_charity: fullUser.default_charity,
            public_opt_in: fullUser.public_opt_in,
            role: fullUser.role,
            is_active: fullUser.is_active,
        });
    });

    it("strips GitHub-internal, contact, token, and timestamp fields", () => {
        const result = toPublicUser(fullUser) as unknown as Record<string, unknown>;

        for (const field of [
            "github_id",
            "github_node_id",
            "github_profile_url",
            "github_email",
            "email",
            "bio",
            "access_token",
            "refresh_token",
            "token_expires_at",
            "scope",
            "created_at",
            "updated_at",
            "last_login_at",
        ]) {
            expect(result).not.toHaveProperty(field);
        }
    });

    it("passes through missing optional fields as undefined rather than throwing", () => {
        const minimalUser = {
            id: "u2",
            github_id: 7,
            github_username: "dev",
            role: "user",
            is_active: true,
        } as const;

        expect(toPublicUser(minimalUser)).toEqual({
            id: "u2",
            github_username: "dev",
            avatar_url: undefined,
            name: undefined,
            display_name: undefined,
            default_charity: undefined,
            public_opt_in: undefined,
            role: "user",
            is_active: true,
        });
    });
});
