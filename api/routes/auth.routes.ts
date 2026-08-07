import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { iResponse } from "../models/response";
import { iGitHubUpsertInput, toPublicUser } from "../models/users";
import { UserService } from "../services/users.service";
import { exchangeCodeForToken, fetchGitHubUser, fetchPrimaryVerifiedEmail } from "../services/github.service";
import { requireAuth } from "../middleware/auth.middleware";
import { config } from "../config/config";
import { logger } from "../config/logger";

const router = Router();
let userService: UserService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    userService = new UserService();
    next();
});

const GITHUB_OAUTH_SCOPE = "read:user user:email";
const STATE_COOKIE_NAME = "gh_oauth_state";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes - just long enough to complete the GitHub redirect round-trip
const SID_COOKIE_NAME = "sid";
const SID_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.REST_NODE_ENV === "production",
    path: "/",
};

const errorRedirectUrl = `${config.FRONTEND_URL}/error?type=github_disconnected`;

/**
 * Kick off the GitHub OAuth flow. Doubles as both signup and login.
 */
router.get("/github/login", async (req: Request, res: Response) => {
    const state = crypto.randomBytes(32).toString("hex");

    res.cookie(STATE_COOKIE_NAME, state, {
        ...baseCookieOptions,
        signed: true,
        maxAge: STATE_COOKIE_MAX_AGE_MS,
    });

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", config.GITHUB_CALLBACK_URL);
    authorizeUrl.searchParams.set("scope", GITHUB_OAUTH_SCOPE);
    authorizeUrl.searchParams.set("state", state);

    res.redirect(authorizeUrl.toString());
});

/**
 * GitHub redirects back here with a code (and the state we handed it).
 */
router.get("/github/callback", async (req: Request, res: Response) => {
    const expectedState = req.signedCookies?.[STATE_COOKIE_NAME];
    res.clearCookie(STATE_COOKIE_NAME, baseCookieOptions);

    try {
        const { code, state } = req.query;

        if (typeof code !== "string" || typeof state !== "string" || !expectedState || state !== expectedState) {
            throw new Error("Invalid OAuth state or missing code.");
        }

        const accessToken = await exchangeCodeForToken(code);
        const ghUser = await fetchGitHubUser(accessToken);
        const email = await fetchPrimaryVerifiedEmail(accessToken);

        const upsertInput: iGitHubUpsertInput = {
            github_id: ghUser.id,
            github_username: ghUser.login,
            github_email: email,
            github_node_id: ghUser.node_id,
            github_profile_url: ghUser.html_url,
            avatar_url: ghUser.avatar_url,
        };

        let redirectUrl = `${config.FRONTEND_URL}/signup/profile`;
        let userId: any;

        // check existence
        const existingUsers = await userService.getUserByGitHubId(ghUser.id);
        if(existingUsers.length) {
            redirectUrl = `${config.FRONTEND_URL}/dashboard`;
            userId = existingUsers[0]?.id;

        } else {
            const user = await userService.insertFromGitHub(upsertInput);
            userId = user.id;
        }

        res.cookie(SID_COOKIE_NAME, userId, {
            ...baseCookieOptions,
            signed: true,
            maxAge: SID_COOKIE_MAX_AGE_MS,
        });

        // continue with signup
        res.redirect(redirectUrl);

    } catch(err) {
        logger.error(err);
        res.redirect(errorRedirectUrl);
    }
});

/**
 * Return the logged-in user's profile.
 */
router.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await userService.getUserById(req.user!.id);

        // getUserById falls back to [] when no row is found
        if (!user || (Array.isArray(user) && user.length === 0)) {
            res.clearCookie(SID_COOKIE_NAME, baseCookieOptions);
            const response: iResponse = { status: 401, success: false, error: "Not authenticated." };
            res.status(401).json(response);
            return;
        }

        const response: iResponse = { status: 200, success: true, data: [toPublicUser(user)] };
        res.status(200).json(response);

    } catch(err) {
        logger.error(err);
        next(err);
    }
});

/**
 * Clear the session cookie.
 */
router.post("/logout", async (req: Request, res: Response) => {
    res.clearCookie(SID_COOKIE_NAME, baseCookieOptions);
    const response: iResponse = { status: 200, success: true };
    res.status(200).json(response);
});

export default router;
