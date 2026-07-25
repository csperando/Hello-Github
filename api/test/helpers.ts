import { sign } from "cookie-signature";
import { config } from "../config/config";

export const signedSidCookie = (userId: string) => `sid=s:${sign(userId, config.SESSION_SECRET)}`;
