import express from "express";
import request from "supertest";
import pingRouter from "../../routes/pingRoutes";

describe("pingRoutes", () => {
    const app = express();
    app.use("/", pingRouter);

    it("responds 200 with the expected message on GET /", async () => {
        const response = await request(app).get("/");
        expect(response.status).toBe(200);
        expect(response.text).toBe("'Commits for Good' REST API is up and running.");
    });

    it("responds to other HTTP methods too, since the route uses router.all", async () => {
        const response = await request(app).post("/");
        expect(response.status).toBe(200);
    });
});
