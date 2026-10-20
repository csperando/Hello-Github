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
        await pool.query(
            "DELETE FROM backfill_jobs WHERE selection_id IN (SELECT id FROM design_selections WHERE user_id = ANY($1));",
            [[userId, otherUserId]],
        );
        await pool.query("DELETE FROM design_selections WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM designs WHERE user_id = ANY($1);", [[userId, otherUserId]]);
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [[testGitHubId, otherTestGitHubId]]);
    });

    describe("createDesign", () => {
        it("creates the design and the creator's own selection together", async () => {
            const { design, selection } = await service.createDesign(userId, {
                pattern: [0, 1, 2, 3, 4, 0, 0],
                start_date: "2026-01-04",
                year: 2026,
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
                    year: 2026,
                } as any),
            ).rejects.toThrow();

            const designs = await service.getDesignsByUserId(bogusUserId);
            expect(designs).toHaveLength(0);
        });
    });

    describe("deleteSelection (soft)", () => {
        async function createOwned() {
            const { design } = await service.createDesign(userId, {
                pattern: [0, 1, 2, 3, 4, 0, 0],
                start_date: "2026-01-04",
                year: 2026,
            } as any);
            return design;
        }

        it("hides the owner's selection and design, but deletes no rows", async () => {
            const design = await createOwned();

            const result = await service.deleteSelection(userId, design.id);

            expect(result.designDeleted).toBe(true);
            expect(await service.getSelection(userId, design.id)).toBeUndefined();
            expect(await service.getSelectionsByUserId(userId)).toEqual([]);
            expect((await service.getDesignById(design.id)).deleted_at).not.toBeNull();
            const rows = await pool.query("SELECT COUNT(*)::int AS n FROM design_selections WHERE design_id = $1;", [design.id]);
            expect(rows.rows[0].n).toBe(1);
        });

        it("leaves another user's existing selection of the design working", async () => {
            const design = await createOwned();
            await service.selectDesign(otherUserId, design.id, { start_date: "2026-01-11", year: 2026 } as any);

            await service.deleteSelection(userId, design.id);

            const theirs = await service.getSelection(otherUserId, design.id);
            expect(theirs).toBeDefined();
            expect(theirs.paint_status).toBe("unpainted");
        });

        it("only hides a non-owner's own selection, never the design", async () => {
            const design = await createOwned();
            await service.selectDesign(otherUserId, design.id, { start_date: "2026-01-11", year: 2026 } as any);

            const result = await service.deleteSelection(otherUserId, design.id);

            expect(result.designDeleted).toBe(false);
            expect((await service.getDesignById(design.id)).deleted_at).toBeNull();
            expect(await service.getSelection(userId, design.id)).toBeDefined();
        });

        it("is refused while a paint is in progress, and keeps a finished paint's job", async () => {
            const design = await createOwned();
            const selection = await service.getSelection(userId, design.id);
            const insertJob = (status: string) =>
                pool.query(
                    `INSERT INTO backfill_jobs (selection_id, status, year, pattern, start_date, custom_range)
                     VALUES ($1, $2, 2026, '{0,1,2,3,4,0,0}', '2026-01-04', FALSE) RETURNING id;`,
                    [selection.id, status],
                );
            const locking = await insertJob("painting");

            await expect(service.deleteSelection(userId, design.id)).rejects.toMatchObject({ code: "DESIGN_LOCKED" });
            expect(await service.getSelection(userId, design.id)).toBeDefined();

            await pool.query("UPDATE backfill_jobs SET status = 'done', completed_at = NOW() WHERE id = $1;", [locking.rows[0].id]);
            await service.deleteSelection(userId, design.id);

            const job = await pool.query("SELECT status FROM backfill_jobs WHERE id = $1;", [locking.rows[0].id]);
            expect(job.rows[0].status).toBe("done");
        });
    });
});
