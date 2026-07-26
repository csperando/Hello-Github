import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import { iGitHubUpsertInput } from "../../models/users";
import { iDesignCreateInput } from "../../models/designs";

describe("DesignsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -6;

    const upsertInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-designs-repo-test",
        github_email: "octocat-designs-repo-test@example.com",
        github_node_id: "MDQ6VXNlcjY=",
        github_profile_url: "https://github.com/octocat-designs-repo-test",
        avatar_url: "https://avatars.githubusercontent.com/u/6?v=4",
    };

    let userId: string;

    const minimalInput: iDesignCreateInput = {
        start_date: "2026-01-04",
        end_date: "2026-01-10",
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
        it("defaults name/is_public/repeat_indefinitely when omitted", async () => {
            const design = await designsRepo.create(userId, minimalInput);

            expect(design.user_id).toBe(userId);
            expect(design.name).toBe("untitled design");
            expect(design.is_public).toBe(false);
            expect(design.repeat_indefinitely).toBe(false);
            expect(design.recurrence_end_date).toBeNull();
            expect(design.pattern).toEqual([0, 1, 2, 3, 4, 0, 0]);
        });

        it("persists all fields when fully specified", async () => {
            const design = await designsRepo.create(userId, {
                name: "Heart 2026",
                is_public: true,
                start_date: "2026-01-04",
                end_date: "2026-01-10",
                pattern: [4, 4, 4, 4, 4, 4, 4],
                repeat_indefinitely: true,
            });

            expect(design.name).toBe("Heart 2026");
            expect(design.is_public).toBe(true);
            expect(design.repeat_indefinitely).toBe(true);
            expect(design.recurrence_end_date).toBeNull();
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
            expect(updated.start_date).not.toBeNull();
        });

        it("can set a bounded recurrence_end_date", async () => {
            const created = await designsRepo.create(userId, minimalInput);

            const updated = await designsRepo.update(created.id, {
                repeat_indefinitely: false,
                recurrence_end_date: "2027-01-01",
            });

            expect(updated.recurrence_end_date).not.toBeNull();
        });

        it("can explicitly clear recurrence_end_date back to null when switching to indefinite", async () => {
            const created = await designsRepo.create(userId, minimalInput);
            await designsRepo.update(created.id, {
                repeat_indefinitely: false,
                recurrence_end_date: "2027-01-01",
            });

            const updated = await designsRepo.update(created.id, {
                repeat_indefinitely: true,
                recurrence_end_date: null as unknown as string,
            });

            expect(updated.repeat_indefinitely).toBe(true);
            expect(updated.recurrence_end_date).toBeNull();
        });

        it("leaves recurrence_end_date untouched when the key is absent from the patch", async () => {
            const created = await designsRepo.create(userId, {
                ...minimalInput,
                repeat_indefinitely: false,
                recurrence_end_date: "2027-01-01",
            });

            const updated = await designsRepo.update(created.id, { name: "renamed only" });

            expect(updated.name).toBe("renamed only");
            expect(updated.recurrence_end_date).not.toBeNull();
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
