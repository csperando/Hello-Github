import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import { DesignService } from "../../services/designs.service";
import { iGitHubUpsertInput } from "../../models/users";

describe("DesignService (transactional methods, real DB)", () => {
    const usersRepo = UsersRepository.repo();
    const service = new DesignService();
    // fixed, out-of-range-for-real-GitHub ids so these tests never collide with real data
    const testGitHubId = -9;
    const otherTestGitHubId = -10;

    let userId: string;
    let otherUserId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-designservice-test",
            github_email: "octocat-designservice-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-designservice-test@users.noreply.github.com`,
            github_node_id: "MDQ6VXNlcjk=",
            github_profile_url: "https://github.com/octocat-designservice-test",
            avatar_url: "https://avatars.githubusercontent.com/u/9?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;

        const otherUser = await usersRepo.upsertFromGitHub({
            github_id: otherTestGitHubId,
            github_username: "octocat-designservice-test-2",
            github_email: "octocat-designservice-test-2@example.com",
            github_noreply_email: `${otherTestGitHubId}+octocat-designservice-test-2@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEw",
            github_profile_url: "https://github.com/octocat-designservice-test-2",
            avatar_url: "https://avatars.githubusercontent.com/u/10?v=4",
        } as iGitHubUpsertInput);
        otherUserId = otherUser.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM design_selections WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM designs WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [[testGitHubId, otherTestGitHubId]]);
    });

    describe("createDesign", () => {
        it("creates the design and the creator's own selection together", async () => {
            const { design, selection } = await service.createDesign(userId, {
                pattern: [0, 1, 2, 3, 4, 0, 0],
                start_date: "2026-01-04",
            } as any);

            expect(design.user_id).toBe(userId);
            expect(selection.user_id).toBe(userId);
            expect(selection.design_id).toBe(design.id);
            expect(selection.start_date).toBe("2026-01-04");
        });

        // The initial selection createDesign makes is always created inactive (see
        // designSelections.repo.ts), so it can never itself collide with the
        // one-active-per-user index - there's no reachable way to make the second
        // insert fail without the first also failing. This test instead confirms the
        // transaction/client are cleaned up correctly and nothing partial is left
        // behind when the *first* statement fails (a bad user_id, violating the FK).
        it("leaves no partial design row when the transaction fails", async () => {
            const bogusUserId = "00000000-0000-0000-0000-000000000000";

            await expect(
                service.createDesign(bogusUserId, {
                    pattern: [0, 1, 2, 3, 4, 0, 0],
                    start_date: "2026-01-04",
                } as any),
            ).rejects.toThrow();

            const designs = await service.getDesignsByUserId(bogusUserId);
            expect(designs).toHaveLength(0);
        });
    });

    describe("deleteSelection", () => {
        it("deletes the design too when it was the last selection referencing it", async () => {
            const { design } = await service.createDesign(userId, {
                pattern: [0, 1, 2, 3, 4, 0, 0],
                start_date: "2026-01-04",
            } as any);

            const result = await service.deleteSelection(userId, design.id);

            expect(result.designDeleted).toBe(true);
            expect(await service.getDesignById(design.id)).toBeUndefined();
        });

        it("keeps the design when other selections still reference it", async () => {
            const { design } = await service.createDesign(userId, {
                pattern: [0, 1, 2, 3, 4, 0, 0],
                start_date: "2026-01-04",
            } as any);
            await service.selectDesign(otherUserId, design.id, { start_date: "2026-01-11" } as any);

            const result = await service.deleteSelection(userId, design.id);

            expect(result.designDeleted).toBe(false);
            expect(await service.getDesignById(design.id)).toBeDefined();
        });
    });
});
