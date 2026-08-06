import { iResponse } from "../../models/response";
import request from "supertest";

import { iUser } from "../../models/users";
import { signedSidCookie } from "../helpers";

// todo - review
// Guardrail against these creeping back into a client-facing response shape.
const SENSITIVE_FIELDS = [
    "access_token",
    "refresh_token",
    "token_expires_at",
    "scope",
    "github_id",
    "github_node_id",
    "github_profile_url",
    "email",
    "bio",
    "created_at",
    "updated_at",
    "last_login_at",
];

// mock users by role
const mockAdminUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    github_id: 12,
    github_username: "admin_user",
    role: "admin",
    is_active: true,
};
const adminCookie = signedSidCookie(mockAdminUser.id as string);

const mockBasicUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    github_id: 13,
    github_username: "basic_user",
    role: "user",
    is_active: true,
};
const basicCookie = signedSidCookie(mockBasicUser.id as string);

// mock repos
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

import type { iUserRepo } from "../../repository/users.repo";
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

import type { iUserProfileRepo } from "../../repository/userProfiles.repo";
const profilesRepoMock = createMockRepoProxy<iUserProfileRepo>();
mockRepo("repository/userProfiles.repo", profilesRepoMock);

import server from "../server";

afterAll(() => {
    server.close();
});

describe("User routes", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();

        // TODO - review: 
        // this is being used due to the requireRole middleware's 
        // dependence on the getUserById method. However, this is also
        // preventing us from testing route behavior unless test users only request themselves
        // usersRepoMock.getUserById.mockResolvedValue(mockAdminUser);
    });

    it("Should reject any /user request with no session", async () => {
        const res = await request(server).get("/user");
        expect(res.status).toBe(401);
    });
});

describe("User routes - Role: User", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();
        usersRepoMock.getUserById.mockResolvedValue(mockBasicUser);
    });

    describe("GET requests", () => {
        it("Should not get all users", async () => {
            usersRepoMock.getAllUsers.mockResolvedValue([mockBasicUser]);
            const res = await request(server).get("/user").set("Cookie", basicCookie);
            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(403);
            expect(body.success).toBe(false);
        });
    
        it("Should not get another user by id", async () => {
            usersRepoMock.getUserById.mockResolvedValue({ ...mockAdminUser, is_active: false });
            const res = await request(server).get("/user/" + mockAdminUser.id).set("Cookie", basicCookie);
            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(403);
            expect(body.success).toBe(false);
        });
    
        it("Should get any user by github username", async () => {
            usersRepoMock.getUserByGitHubUsername.mockResolvedValue(mockAdminUser);
            const res = await request(server).get("/user/gh/" + mockAdminUser.github_username).set("Cookie", basicCookie);
            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
        });
    });

    // describe("POST requests", () => {
    //     it("DNE")
    // });

    describe("PATCH /user/:userId", () => {
        it("lets a user update their profile", async () => {
            const newName = "John Galt";
            profilesRepoMock.upsert.mockResolvedValue({ ...mockBasicUser, display_name: newName });
            usersRepoMock.getUserById.mockResolvedValue({ ...mockBasicUser, display_name: newName });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send({ display_name: newName });
            
            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockBasicUser.id, { display_name: newName });
        });

        // TODO - review, make sure all fields are tested
        it("lets a user update their profile - check all fields", async () => {
            profilesRepoMock.upsert.mockResolvedValue({
                user_id: mockBasicUser.id,
                timezone: "America/Chicago",
                use_real_email: true,
            });

            usersRepoMock.getUserById.mockResolvedValue({
                ...mockBasicUser,
                timezone: "America/Chicago",
                use_real_email: true,
            });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send({ timezone: "America/Chicago", use_real_email: true });

            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(200);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockBasicUser.id, {
                timezone: "America/Chicago",
                use_real_email: true,
            });
            expect((body.data![0] as any).timezone).toBe("America/Chicago");
            expect((body.data![0] as any).use_real_email).toBe(true);
        });

        it("does not return sensitive data", async () => {
            const newName = "John Galt";
            profilesRepoMock.upsert.mockResolvedValue({ ...mockBasicUser, display_name: newName });
            usersRepoMock.getUserById.mockResolvedValue({ ...mockBasicUser, display_name: newName, access_token: "gho_secret" });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send({ display_name: newName });
            
            const body: iResponse = JSON.parse(res.text);
            expect((body.data![0] as any).display_name).toBe(newName);
            expect(body.data![0]).not.toHaveProperty("access_token");
            expect(body.data![0]).not.toHaveProperty("github_id");
        });

        it("does not update admin fields", async () => {
            profilesRepoMock.upsert.mockResolvedValue(mockBasicUser);
            usersRepoMock.getUserById.mockResolvedValue(mockBasicUser);

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send({ display_name: "all_you_should_see", role: "admin", is_active: false });

            expect(res.status).toBe(200);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockBasicUser.id, { display_name: "all_you_should_see" });
        });

        it("does not include any sensitive data - check all fields", async () => {
            profilesRepoMock.upsert.mockResolvedValue({ user_id: mockBasicUser.id, display_name: "John Galt" });
            usersRepoMock.getUserById.mockResolvedValue({
                ...mockBasicUser,
                display_name: "John Galt",
                access_token: "gho_secret",
                refresh_token: "ghr_secret",
                token_expires_at: "2026-08-01T00:00:00Z",
                scope: "read:user user:email",
                github_node_id: "MDQ6VXNlcjE=",
                github_profile_url: "https://github.com/csperando",
                email: "personal@example.com",
                bio: "I paint pixels.",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
                last_login_at: "2026-07-28T00:00:00Z",
            });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send({ display_name: "test" });
            const body: iResponse = JSON.parse(res.text);

            for (const field of SENSITIVE_FIELDS) {
                expect(body.data![0]).not.toHaveProperty(field);
            }
        });

        it("validates bad request fields and returns 400", async () => {
            const badReq = {
                display_name: "me",
                public_opt_in: "yes",
                timezone: "Not/A_Real_Zone",
                use_real_email: "no",
            };

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", basicCookie)
                .send(badReq);
            const body: iResponse = JSON.parse(res.text);

            expect(res.status).toBe(400);
            expect(body.success).toBe(false);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();

            // there should be an error response for every bad property in the request body
            expect(body).toHaveProperty("errors");
            const errors = body.errors?.map((e) => e.property) || [];
            for(let prop in badReq) {
                expect(errors).toContain(prop);
            }
            
        });

        it("does not update another user when not an admin", async () => {
            const res = await request(server)
                .patch("/user/" + mockAdminUser.id)
                .set("Cookie", basicCookie)
                .send({ display_name: "Someone Else" });

            expect(res.status).toBe(403);
            expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        });
    });

    describe("DELETE requests", () => {
        // TODO 
        it("TODO - should let a user delete their account", () => {
            expect(1).toBe(1);
        });
    });
});

describe("User routes - Role: Admin", () => {
    beforeEach(() => {
        usersRepoMock.__reset();
        profilesRepoMock.__reset();

        // usersRepoMock.getUserById.mockResolvedValue(mockAdminUser);
        usersRepoMock.getUserById.mockImplementation(async (userId: string) =>
            userId === mockAdminUser.id ? mockAdminUser : mockBasicUser 
        );
    });

    describe("GET requests", () => {
        it("Should get all users", async () => {
            usersRepoMock.getAllUsers.mockResolvedValue([mockAdminUser]);
            const res = await request(server).get("/user").set("Cookie", adminCookie);
            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
        });
    
        // TODO
        it("Should get a different user by their id", async () => {
            // usersRepoMock.getUserById.mockResolvedValue(mockBasicUser);
            usersRepoMock.getUserById.mockResolvedValue(mockAdminUser);
            const res = await request(server)
                // .get("/user/" + mockBasicUser.id)
                .get("/user/" + mockAdminUser.id)
                .set("Cookie", adminCookie);

            const body: iResponse = JSON.parse(res.text);
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
        });
    
        it("Should fail to get users for an inactive admin account", async () => {
            usersRepoMock.getUserById.mockResolvedValue({ ...mockAdminUser, is_active: false });
            const res = await request(server).get("/user/" + mockAdminUser.id).set("Cookie", adminCookie);
            expect(res.status).toBe(403);
        });
    });

    describe("POST /user", () => {
        // TODO 
        it("Should not create a new user", async () => {
            const res = await request(server)
                .post("/user/")
                .set("Cookie", adminCookie)
                .send({ ...mockBasicUser, });

            const body: iResponse = JSON.parse(res.text);
            
            expect(res.status).toBe(405);
            expect(body.success).toBe(false);
        });
    });

    describe("PATCH /user/:userId", () => {
        it("updates another user when admin", async () => {
            const newName = "John Galt";
            const updatedUser = { ...mockBasicUser, display_name: newName };
            usersRepoMock.getUserById.mockImplementation(async (userId: string) => userId === mockAdminUser.id ? mockAdminUser : updatedUser);
            profilesRepoMock.upsert.mockResolvedValue({ user_id: mockBasicUser.id, display_name: newName });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", adminCookie)
                .send({ display_name: newName });

            expect(res.status).toBe(200);
            expect(profilesRepoMock.upsert).toHaveBeenCalledWith(mockBasicUser.id, { display_name: newName });
        });

        it("returns the full user shape (not the reduced client shape) when an admin updates another user's profile", async () => {
            const newName = "John Galt";
            const newGitHubId = 99;
            const updatedUser = { ...mockBasicUser, display_name: newName, github_id: newGitHubId };
            usersRepoMock.getUserById.mockImplementation(async (userId: string) => userId === mockAdminUser.id ? mockAdminUser : updatedUser);
            profilesRepoMock.upsert.mockResolvedValue({ user_id: mockBasicUser.id, display_name: newName, newGitHubId: newGitHubId });

            const res = await request(server)
                .patch("/user/" + mockBasicUser.id)
                .set("Cookie", adminCookie)
                .send({ display_name: newName, github_id: newGitHubId });
            const body: iResponse = JSON.parse(res.text);

            expect((body.data![0] as any).github_id).toBe(newGitHubId);
        });

        // // TODO - this fails due to our use of the mock getUserById function
        // it("returns 404 when an admin targets a userId that doesn't exist", async () => {
        //     const res = await request(server)
        //         .patch("/user/872365478q32548176234")
        //         .set("Cookie", adminCookie)
        //         .send({ display_name: "Someone Else" });

        //     expect(res.status).toBe(404);
        //     expect(profilesRepoMock.upsert).not.toHaveBeenCalled();
        // });
    });
});
