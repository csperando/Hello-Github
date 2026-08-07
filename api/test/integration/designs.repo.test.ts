import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import { iGitHubUpsertInput } from "../../models/users";
import { iDesignContentInput } from "../../repository/designs.repo";

describe("DesignsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -6;

    const upsertInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-designs-repo-test",
        github_email: "octocat-designs-repo-test@example.com",
        github_noreply_email: `${testGitHubId}+octocat-designs-repo-test@users.noreply.github.com`,
        github_node_id: "MDQ6VXNlcjY=",
        github_profile_url: "https://github.com/octocat-designs-repo-test",
        avatar_url: "https://avatars.githubusercontent.com/u/6?v=4",
    };

    let userId: string;

    const minimalInput: iDesignContentInput = {
        pattern: [0, 1, 2, 3, 4, 0, 0],
    };

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub(upsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        // designs restrict-delete on user_id, so clear them before the user
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    describe("create", () => {
        it("defaults name/is_public when omitted", async () => {
            const design = await designsRepo.create(userId, minimalInput);

            expect(design.user_id).toBe(userId);
            expect(design.name).toBe("untitled design");
            expect(design.is_public).toBe(false);
            expect(design.pattern).toEqual([0, 1, 2, 3, 4, 0, 0]);
        });

        it("persists all fields when fully specified", async () => {
            const design = await designsRepo.create(userId, {
                name: "Heart 2026",
                is_public: true,
                pattern: [4, 4, 4, 4, 4, 4, 4],
            });

            expect(design.name).toBe("Heart 2026");
            expect(design.is_public).toBe(true);
        });

        it("does not persist any scheduling fields - designs holds content only", async () => {
            const design = await designsRepo.create(userId, minimalInput);

            expect(design).not.toHaveProperty("start_date");
            expect(design).not.toHaveProperty("end_date");
            expect(design).not.toHaveProperty("repeat_indefinitely");
            expect(design).not.toHaveProperty("recurrence_end_date");
        });
    });

    describe("getById / getAllByUserId", () => {
        it("getById returns the created design", async () => {
            const created = await designsRepo.create(userId, minimalInput);
            const fetched = await designsRepo.getById(created.id);

            expect(fetched.id).toBe(created.id);
            expect(fetched.user_id).toBe(userId);
        });

        it("getById returns undefined for a missing design", async () => {
            const fetched = await designsRepo.getById("00000000-0000-0000-0000-000000000000");
            expect(fetched).toBeUndefined();
        });

        it("getAllByUserId returns every design owned by that user", async () => {
            const first = await designsRepo.create(userId, minimalInput);
            const second = await designsRepo.create(userId, { ...minimalInput, name: "second" });

            const all = await designsRepo.getAllByUserId(userId);

            expect(all).toHaveLength(2);
            expect(all.map((d: any) => d.id).sort()).toEqual([first.id, second.id].sort());
        });

        it("getAllByUserId returns an empty array for a user with no designs", async () => {
            const all = await designsRepo.getAllByUserId(userId);
            expect(all).toEqual([]);
        });
    });

    describe("update", () => {
        it("only overwrites fields provided, leaving others as-is", async () => {
            const created = await designsRepo.create(userId, { ...minimalInput, name: "original" });

            const updated = await designsRepo.update(created.id, { name: "renamed" });

            expect(updated.name).toBe("renamed");
            expect(updated.pattern).toEqual(minimalInput.pattern);
        });

        it("can update pattern", async () => {
            const created = await designsRepo.create(userId, minimalInput);

            const updated = await designsRepo.update(created.id, { pattern: [4, 4, 4, 4, 4, 4, 4] });

            expect(updated.pattern).toEqual([4, 4, 4, 4, 4, 4, 4]);
        });

        it("bumps updated_at", async () => {
            const created = await designsRepo.create(userId, minimalInput);
            const updated = await designsRepo.update(created.id, { name: "bump" });

            expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
                new Date(created.updated_at).getTime(),
            );
        });
    });

    describe("delete", () => {
        it("removes the design", async () => {
            const created = await designsRepo.create(userId, minimalInput);

            await designsRepo.delete(created.id);

            const fetched = await designsRepo.getById(created.id);
            expect(fetched).toBeUndefined();
        });
    });
});
