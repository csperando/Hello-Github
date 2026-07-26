import type { iDesignsRepo } from "../../repository/designs.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const designsRepoMock = createMockRepoProxy<iDesignsRepo>();
mockRepo("repository/designs.repo", designsRepoMock);

import { DesignService } from "../../services/designs.service";

describe("DesignService", () => {
    let service: DesignService;

    beforeEach(() => {
        designsRepoMock.__reset();
        service = new DesignService();
    });

    it("createDesign delegates to the repo and returns its result", async () => {
        const input = { start_date: "2026-01-04", end_date: "2026-01-10", pattern: [0, 1, 2, 3, 4, 0, 0] };
        designsRepoMock.create.mockResolvedValue({ id: "d1", user_id: "u1", ...input });

        const result = await service.createDesign("u1", input as any);

        expect(designsRepoMock.create).toHaveBeenCalledWith("u1", input);
        expect(result).toEqual({ id: "d1", user_id: "u1", ...input });
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

    it("deleteDesign delegates to the repo", async () => {
        designsRepoMock.delete.mockResolvedValue({ id: "d1" });

        const result = await service.deleteDesign("d1");

        expect(designsRepoMock.delete).toHaveBeenCalledWith("d1");
        expect(result).toEqual({ id: "d1" });
    });

    it("propagates repo errors without swallowing them", async () => {
        designsRepoMock.getById.mockRejectedValue(new Error("db down"));

        await expect(service.getDesignById("d1")).rejects.toThrow("db down");
    });
});
