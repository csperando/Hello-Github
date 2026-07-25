import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { config } from "../../config/config";
import { requireAuth } from "../../middleware/auth.middleware";
import { signedSidCookie } from "../helpers";

const testApp = express();
testApp.use(cookieParser(config.SESSION_SECRET));
testApp.get("/protected", requireAuth, (req: Request, res: Response) => {
    res.status(200).json({ success: true, status: 200, data: [req.user] });
});

describe("requireAuth middleware", () => {
    it("rejects a request with no session cookie", async () => {
        const res = await request(testApp).get("/protected");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("rejects a request with a tampered session cookie", async () => {
        const res = await request(testApp)
            .get("/protected")
            .set("Cookie", "sid=s:not-a-valid-signature");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("rejects a request with an unsigned session cookie", async () => {
        const res = await request(testApp)
            .get("/protected")
            .set("Cookie", "sid=some-user-id");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("allows a request with a valid signed session cookie and populates req.user", async () => {
        const userId = "123e4567-e89b-12d3-a456-426614174000";
        const res = await request(testApp)
            .get("/protected")
            .set("Cookie", signedSidCookie(userId));

        expect(res.status).toBe(200);
        expect(res.body.data[0]).toEqual({ id: userId });
    });
});
