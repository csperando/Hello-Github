import type { iDesignsRepo } from "../../repository/designs.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);

import { DesignService } from "../../services/designs.service";

describe("DesignService (delegation methods)", () => {
    let service: DesignService;

    beforeEach(() => {
        designsRepoMock.__reset();
        selectionsRepoMock.__reset();
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
});
