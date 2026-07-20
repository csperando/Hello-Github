import express from "express";
import request from "supertest";
import pingRouter from "../../routes/pingRoutes";

describe("pingRoutes", () => {
    const app = express();
    app.use("/", pingRouter);

    it("responds 200 with the expected message on GET /", async () => {
        const response = await request(app).get("/");
        expect(response.status).toBe(200);
    });
});
