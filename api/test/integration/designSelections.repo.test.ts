import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("DesignSelectionsRepository", () => {
    const usersRepo = UsersRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    // fixed, out-of-range-for-real-GitHub ids so these tests never collide with real data
    const testGitHubId = -7;
    const otherTestGitHubId = -8;

    let userId: string;
    let otherUserId: string;
    let designId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-selections-repo-test",
            github_email: "octocat-selections-repo-test@example.com",
            github_node_id: "MDQ6VXNlcjc=",
            github_profile_url: "https://github.com/octocat-selections-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/7?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const otherUser = await usersRepo.upsertFromGitHub({
            github_id: otherTestGitHubId,
            github_username: "octocat-selections-repo-test-2",
            github_email: "octocat-selections-repo-test-2@example.com",
            github_node_id: "MDQ6VXNlcjg=",
            github_profile_url: "https://github.com/octocat-selections-repo-test-2",
            avatar_url: "https://avatars.githubusercontent.com/u/8?v=4",
        } as iGitHubUpsertInput);
        otherUserId = otherUser.id;

        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        designId = design.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM design_selections WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM designs WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [[testGitHubId, otherTestGitHubId]]);
    });

    describe("create", () => {
        it("defaults is_active to false and repeat_indefinitely to false when omitted", async () => {
            const selection = await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });

            expect(selection.user_id).toBe(userId);
            expect(selection.design_id).toBe(designId);
            expect(selection.is_active).toBe(false);
            expect(selection.repeat_indefinitely).toBe(false);
            expect(selection.recurrence_end_date).toBeNull();
        });

        it("persists is_active=true and recurrence fields when specified", async () => {
            const selection = await selectionsRepo.create(userId, designId, {
                start_date: "2026-01-04",
                is_active: true,
                repeat_indefinitely: false,
                recurrence_end_date: "2027-01-01",
            });

            expect(selection.is_active).toBe(true);
            expect(selection.recurrence_end_date).toBe("2027-01-01");
        });

        it("rejects a second active selection for the same user on a different design", async () => {
            const secondDesign = await designsRepo.create(userId, { pattern: [0, 0, 0, 0, 0, 0, 0] });
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04", is_active: true });

            await expect(
                selectionsRepo.create(userId, secondDesign.id, { start_date: "2026-01-04", is_active: true }),
            ).rejects.toThrow();
        });

        it("allows two different users to each independently select the same design", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });
            const otherSelection = await selectionsRepo.create(otherUserId, designId, { start_date: "2026-01-11" });

            expect(otherSelection.user_id).toBe(otherUserId);
            expect(otherSelection.design_id).toBe(designId);
            expect(otherSelection.start_date).toBe("2026-01-11");
        });
    });

    describe("getByUserAndDesign / getAllForUser", () => {
        it("getByUserAndDesign returns undefined when no selection exists", async () => {
            const selection = await selectionsRepo.getByUserAndDesign(userId, designId);
            expect(selection).toBeUndefined();
        });

        it("getAllForUser returns selections joined with the design's content", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04", is_active: true });

            const all = await selectionsRepo.getAllForUser(userId);

            expect(all).toHaveLength(1);
            expect(all[0].design_id).toBe(designId);
            expect(all[0].pattern).toEqual([0, 1, 2, 3, 4, 0, 0]);
            expect(all[0].design_owner_id).toBe(userId);
        });

        it("getAllForUser only returns the requesting user's own selections", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });
            await selectionsRepo.create(otherUserId, designId, { start_date: "2026-01-04" });

            const mine = await selectionsRepo.getAllForUser(userId);
            expect(mine).toHaveLength(1);
            expect(mine[0].user_id).toBe(userId);
        });
    });

    describe("update", () => {
        it("only overwrites fields provided, leaving others as-is", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });

            const updated = await selectionsRepo.update(userId, designId, { is_active: true });

            expect(updated.is_active).toBe(true);
            expect(updated.start_date).toBe("2026-01-04");
        });

        it("can explicitly clear recurrence_end_date back to null when switching to indefinite", async () => {
            await selectionsRepo.create(userId, designId, {
                start_date: "2026-01-04",
                repeat_indefinitely: false,
                recurrence_end_date: "2027-01-01",
            });

            const updated = await selectionsRepo.update(userId, designId, {
                repeat_indefinitely: true,
                recurrence_end_date: null as unknown as string,
            });

            expect(updated.repeat_indefinitely).toBe(true);
            expect(updated.recurrence_end_date).toBeNull();
        });

        it("leaves recurrence_end_date untouched when the key is absent from the patch", async () => {
            await selectionsRepo.create(userId, designId, {
                start_date: "2026-01-04",
                recurrence_end_date: "2027-01-01",
            });

            const updated = await selectionsRepo.update(userId, designId, { start_date: "2026-01-11" });

            expect(updated.start_date).toBe("2026-01-11");
            expect(updated.recurrence_end_date).toBe("2027-01-01");
        });

        it("rejects activating a selection while another one is already active for the same user", async () => {
            const secondDesign = await designsRepo.create(userId, { pattern: [0, 0, 0, 0, 0, 0, 0] });
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04", is_active: true });
            await selectionsRepo.create(userId, secondDesign.id, { start_date: "2026-01-04", is_active: false });

            await expect(
                selectionsRepo.update(userId, secondDesign.id, { is_active: true }),
            ).rejects.toThrow();
        });
    });

    describe("delete / countForDesign", () => {
        it("removes the selection", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });

            await selectionsRepo.delete(userId, designId);

            const fetched = await selectionsRepo.getByUserAndDesign(userId, designId);
            expect(fetched).toBeUndefined();
        });

        it("countActiveExcludingUser counts only other users' active selections", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04", is_active: true });
            await selectionsRepo.create(otherUserId, designId, { start_date: "2026-01-04", is_active: false });

            // otherUser's selection is inactive - doesn't count yet, and never counts the requester's own
            expect(await selectionsRepo.countActiveExcludingUser(designId, userId)).toBe(0);

            await selectionsRepo.update(otherUserId, designId, { is_active: true });

            expect(await selectionsRepo.countActiveExcludingUser(designId, userId)).toBe(1);
            // from otherUser's perspective, it's userId's active selection being counted
            expect(await selectionsRepo.countActiveExcludingUser(designId, otherUserId)).toBe(1);
        });

        it("countForDesign reflects the number of remaining selections across all users", async () => {
            await selectionsRepo.create(userId, designId, { start_date: "2026-01-04" });
            await selectionsRepo.create(otherUserId, designId, { start_date: "2026-01-04" });

            expect(await selectionsRepo.countForDesign(designId)).toBe(2);

            await selectionsRepo.delete(userId, designId);
            expect(await selectionsRepo.countForDesign(designId)).toBe(1);

            await selectionsRepo.delete(otherUserId, designId);
            expect(await selectionsRepo.countForDesign(designId)).toBe(0);
        });
    });
});
