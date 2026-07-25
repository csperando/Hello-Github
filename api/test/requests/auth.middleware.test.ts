import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { config } from "../../config/config";
import { signedSidCookie } from "../helpers";
import { iUser } from "../../models/users";
import { iResponse } from "../../models/response";

import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import { requireAuth, requireRole } from "../../middleware/auth.middleware";

const testApp = express();
testApp.use(cookieParser(config.SESSION_SECRET));
testApp.get("/protected", requireAuth, (req: Request, res: Response) => {
    res.status(200).json({ success: true, status: 200, data: [req.user] });
});
testApp.get("/admin-only", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
    res.status(200).json({ success: true, status: 200, data: [req.user] });
});
testApp.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    const response: iResponse = { status: 500, success: false, error: err };
    res.status(500).json(response);
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

describe("requireRole middleware", () => {
    const adminUserId = "223e4567-e89b-12d3-a456-426614174001";
    const mockAdminUser: iUser = {
        id: adminUserId,
        github_id: 1,
        github_username: "admin-user",
        role: "admin",
        is_active: true,
    };

    beforeEach(() => {
        usersRepoMock.__reset();
    });

    it("rejects a request with no session (req.user never set)", async () => {
        const res = await request(testApp).get("/admin-only");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(usersRepoMock.getUserById).not.toHaveBeenCalled();
    });

    it("rejects a user whose role is not in the allowed list", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockAdminUser, role: "user" });

        const res = await request(testApp)
            .get("/admin-only")
            .set("Cookie", signedSidCookie(adminUserId));

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it("rejects an inactive user even if the role matches", async () => {
        usersRepoMock.getUserById.mockResolvedValue({ ...mockAdminUser, is_active: false });

        const res = await request(testApp)
            .get("/admin-only")
            .set("Cookie", signedSidCookie(adminUserId));

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it("rejects when the user can't be found", async () => {
        // repo returns undefined when no row matches; UserService.getUserById falls back to []
        usersRepoMock.getUserById.mockResolvedValue(undefined);

        const res = await request(testApp)
            .get("/admin-only")
            .set("Cookie", signedSidCookie(adminUserId));

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    it("allows an active user with an allowed role and populates req.user.role", async () => {
        usersRepoMock.getUserById.mockResolvedValue(mockAdminUser);

        const res = await request(testApp)
            .get("/admin-only")
            .set("Cookie", signedSidCookie(adminUserId));

        expect(res.status).toBe(200);
        expect(res.body.data[0]).toEqual({ id: adminUserId, role: "admin" });
    });

    it("returns 500 when the role lookup fails", async () => {
        usersRepoMock.getUserById.mockRejectedValue(new Error("ECONNREFUSED"));

        const res = await request(testApp)
            .get("/admin-only")
            .set("Cookie", signedSidCookie(adminUserId));

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
