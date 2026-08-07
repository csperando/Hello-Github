import { sign } from "cookie-signature";
import { config } from "../config/config";

export const signedSidCookie = (userId: string) => `sid=s:${sign(userId, config.SESSION_SECRET)}`;

// get mock users by role
import { iUser } from "../models/users";
export const mockAdminUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    github_id: 12,
    github_username: "admin_user",
    role: "admin",
    is_active: true,
};

export const mockBasicUser: iUser = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    github_id: 13,
    github_username: "basic_user",
    role: "user",
    is_active: true,
};

// get user cookies by role for session validation
export const adminCookie = signedSidCookie(mockAdminUser.id as string);
export const basicCookie = signedSidCookie(mockBasicUser.id as string);


// mock organizations
import { iOrg } from "../models/orgs";
export const mockOrg: iOrg = {
    id: 1,
    ein: "12-3456789",
    name: "Test Org",
    street: "123 Main St",
    city: "Testopolis",
    state: "TN",
    zip: "12345",
};

// TODO - this repeats a lot
// usersRepoMock.getUserById.mockResolvedValue(mockAdminUser);
// usersRepoMock.getUserById.mockImplementation(async (userId: string) =>
//     userId === mockAdminUser.id ? mockAdminUser : mockBasicUser 
// );
