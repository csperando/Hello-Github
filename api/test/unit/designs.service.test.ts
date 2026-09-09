import type { iDesignsRepo } from "../../repository/designs.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import type { iRunLogRepo } from "../../repository/runLog.repo";
import type { iUserBillingRepo } from "../../repository/userBilling.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);
const runLogRepoMock = createMockRepoProxy<iRunLogRepo>();
mockRepo("repository/runLog.repo", runLogRepoMock);
const billingRepoMock = createMockRepoProxy<iUserBillingRepo>();
mockRepo("repository/userBilling.repo", billingRepoMock);

import { DesignService, PaymentRequiredError } from "../../services/designs.service";

const covered = () => ({ paid_until: new Date(Date.now() + 30 * 8.64e7).toISOString() });

describe("DesignService (delegation methods)", () => {
    let service: DesignService;

    beforeEach(() => {
        designsRepoMock.__reset();
        selectionsRepoMock.__reset();
        runLogRepoMock.__reset();
        billingRepoMock.__reset();
        billingRepoMock.getByUserId.mockResolvedValue(covered());
        service = new DesignService();
    });

    it("getDesignById delegates to the repo", async () => {
        designsRepoMock.getById.mockResolvedValue({ id: "d1" });

        const result = await service.getDesignById("d1");

        expect(designsRepoMock.getById).toHaveBeenCalledWith("d1");
        expect(result).toEqual({ id: "d1" });
    });

    it("getDesignsByUserId delegates to the repo", async () => {
        designsRepoMock.getAllByUserId.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);

        const result = await service.getDesignsByUserId("u1");

        expect(designsRepoMock.getAllByUserId).toHaveBeenCalledWith("u1");
        expect(result).toEqual([{ id: "d1" }, { id: "d2" }]);
    });

    it("updateDesign delegates to the repo", async () => {
        designsRepoMock.update.mockResolvedValue({ id: "d1", name: "renamed" });

        const result = await service.updateDesign("d1", { name: "renamed" });

        expect(designsRepoMock.update).toHaveBeenCalledWith("d1", { name: "renamed" });
        expect(result).toEqual({ id: "d1", name: "renamed" });
    });

    it("propagates repo errors without swallowing them", async () => {
        designsRepoMock.getById.mockRejectedValue(new Error("db down"));

        await expect(service.getDesignById("d1")).rejects.toThrow("db down");
    });

    it("getSelectionsByUserId delegates to the selections repo", async () => {
        selectionsRepoMock.getAllForUser.mockResolvedValue([{ id: "s1" }]);

        const result = await service.getSelectionsByUserId("u1");

        expect(selectionsRepoMock.getAllForUser).toHaveBeenCalledWith("u1");
        expect(result).toEqual([{ id: "s1" }]);
    });

    it("getSelection delegates to the selections repo", async () => {
        selectionsRepoMock.getByUserAndDesign.mockResolvedValue({ id: "s1" });

        const result = await service.getSelection("u1", "d1");

        expect(selectionsRepoMock.getByUserAndDesign).toHaveBeenCalledWith("u1", "d1");
        expect(result).toEqual({ id: "s1" });
    });

    it("countOtherActiveSelections delegates to the selections repo", async () => {
        selectionsRepoMock.countActiveExcludingUser.mockResolvedValue(3);

        const result = await service.countOtherActiveSelections("d1", "u1");

        expect(selectionsRepoMock.countActiveExcludingUser).toHaveBeenCalledWith("d1", "u1");
        expect(result).toBe(3);
    });

    it("selectDesign delegates to the selections repo", async () => {
        selectionsRepoMock.create.mockResolvedValue({ id: "s1" });

        const result = await service.selectDesign("u1", "d1", { start_date: "2026-01-04" } as any);

        expect(selectionsRepoMock.create).toHaveBeenCalledWith("u1", "d1", { start_date: "2026-01-04" });
        expect(result).toEqual({ id: "s1" });
    });

    it("updateSelection delegates to the selections repo", async () => {
        selectionsRepoMock.update.mockResolvedValue({ id: "s1", is_active: true });

        const result = await service.updateSelection("u1", "d1", { is_active: true });

        expect(selectionsRepoMock.update).toHaveBeenCalledWith("u1", "d1", { is_active: true });
        expect(result).toEqual({ id: "s1", is_active: true });
    });

    describe("activation payment gate", () => {
        it("blocks selectDesign with is_active:true when the user has no current paid period", async () => {
            billingRepoMock.getByUserId.mockResolvedValue(null);

            await expect(
                service.selectDesign("u1", "d1", { start_date: "2026-01-04", is_active: true } as any),
            ).rejects.toBeInstanceOf(PaymentRequiredError);
            expect(selectionsRepoMock.create).not.toHaveBeenCalled();
        });

        it("blocks updateSelection with is_active:true when paid_until is in the past", async () => {
            billingRepoMock.getByUserId.mockResolvedValue({ paid_until: "2000-01-01T00:00:00.000Z" });

            await expect(service.updateSelection("u1", "d1", { is_active: true })).rejects.toBeInstanceOf(
                PaymentRequiredError,
            );
            expect(selectionsRepoMock.update).not.toHaveBeenCalled();
        });

        it("allows a covered user to activate", async () => {
            selectionsRepoMock.update.mockResolvedValue({ id: "s1", is_active: true });
            await service.updateSelection("u1", "d1", { is_active: true });
            expect(selectionsRepoMock.update).toHaveBeenCalled();
        });

        it("does not check payment when the update leaves is_active alone or sets it false", async () => {
            billingRepoMock.getByUserId.mockResolvedValue(null);
            selectionsRepoMock.update.mockResolvedValue({ id: "s1" });

            await service.updateSelection("u1", "d1", { start_date: "2026-02-01" });
            await service.updateSelection("u1", "d1", { is_active: false });

            expect(billingRepoMock.getByUserId).not.toHaveBeenCalled();
            expect(selectionsRepoMock.update).toHaveBeenCalledTimes(2);
        });
    });

    it("getLastRunStatuses delegates to the run_log repo", async () => {
        runLogRepoMock.getLatestPerDesignForUser.mockResolvedValue([{ design_id: "d1", status: "committed" }]);

        const result = await service.getLastRunStatuses("u1");

        expect(runLogRepoMock.getLatestPerDesignForUser).toHaveBeenCalledWith("u1");
        expect(result).toEqual([{ design_id: "d1", status: "committed" }]);
    });

    it("getLastRunStatuses defaults to an empty array when the repo returns nothing", async () => {
        runLogRepoMock.getLatestPerDesignForUser.mockResolvedValue(undefined as unknown as any[]);

        const result = await service.getLastRunStatuses("u1");

        expect(result).toEqual([]);
    });
});
