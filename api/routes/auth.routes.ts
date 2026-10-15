import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { iResponse } from "../models/response";
import { iGitHubUpsertInput, toPublicUser } from "../models/users";
import { UserService } from "../services/users.service";
import { BackfillService } from "../services/backfill.service";
import {
    exchangeCodeForToken,
    fetchGitHubUser,
    fetchGitHubEmails,
    pickPrimaryVerifiedEmail,
    pickNoreplyEmail,
    computeNoreplyEmail,
} from "../services/github.service";
import { requireAuth } from "../middleware/auth.middleware";
import { config } from "../config/config";
import { logger } from "../config/logger";

const router = Router();
let userService: UserService;
let backfillService: BackfillService;

router.all("/{*splat}", [], async (req: Request, res: Response, next: NextFunction) => {
    userService = new UserService();
    backfillService = new BackfillService();
    next();
});

const GITHUB_OAUTH_SCOPE = "read:user user:email";
const STATE_COOKIE_NAME = "gh_oauth_state";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes - just long enough to complete the GitHub redirect round-trip
// paint consent: a one-off step-up after buying a design (see backfill.service.ts)
const PAINT_OAUTH_SCOPE = "public_repo";
const PAINT_STATE_COOKIE_NAME = "gh_paint_state";
const PAINT_CALLBACK_URL = `${config.GITHUB_CALLBACK_URL}/paint`; // OAuth Apps accept a sub-path of the registered callback
const SID_COOKIE_NAME = "sid";
const SID_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.REST_NODE_ENV === "production",
    path: "/",
};

const errorRedirectUrl = `${config.FRONTEND_URL}/error?type=github_disconnected`;
// carries the design (when known) so the error page can offer a straight retry
const paintErrorRedirectUrl = (designId?: unknown) => {
    const url = new URL(`${config.FRONTEND_URL}/error`);
    url.searchParams.set("type", "paint_consent_failed");
    if (typeof designId === "string" && designId.length > 0) url.searchParams.set("designId", designId);
    return url.toString();
};

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
        const emails = await fetchGitHubEmails(accessToken);
        const email = pickPrimaryVerifiedEmail(emails);
        const noreplyEmail = pickNoreplyEmail(emails) ?? computeNoreplyEmail(ghUser.id, ghUser.login);

        const upsertInput: iGitHubUpsertInput = {
            github_id: ghUser.id,
            github_username: ghUser.login,
            github_email: email,
            github_noreply_email: noreplyEmail,
            github_node_id: ghUser.node_id,
            github_profile_url: ghUser.html_url,
            avatar_url: ghUser.avatar_url,
        };

        let redirectUrl = `${config.FRONTEND_URL}/signup/profile`;
        let userId: any;

        // check existence
        const existingUser = await userService.getUserByGitHubId(ghUser.id);
        if(existingUser) {
            redirectUrl = `${config.FRONTEND_URL}/dashboard`;
            userId = existingUser.id;

        } else {
            const user = await userService.upsertFromGitHub(upsertInput);
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
 * Start the paint consent for a bought design: GitHub asks the user to grant
 * public_repo so we can open the canvas-repo issue as them. The design id
 * rides along in the signed state cookie, not the callback URL.
 */
router.get("/github/paint", requireAuth, async (req: Request, res: Response) => {
    try {
        const designId = req.query.designId;
        if (typeof designId !== "string" || designId.length === 0) {
            throw new Error("paint consent: missing designId.");
        }

        const job = await backfillService.getJob(req.user!.id, designId);
        if (!job) {
            throw new Error(`paint consent: user ${req.user!.id} has no job for design ${designId}.`);
        }
        if (job.status !== "awaiting_issue") {
            // already consented - nothing left to do
            res.redirect(`${config.FRONTEND_URL}/dashboard`);
            return;
        }

        const state = crypto.randomBytes(32).toString("hex");
        res.cookie(PAINT_STATE_COOKIE_NAME, JSON.stringify({ state, designId }), {
            ...baseCookieOptions,
            signed: true,
            maxAge: STATE_COOKIE_MAX_AGE_MS,
        });

        const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
        authorizeUrl.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
        authorizeUrl.searchParams.set("redirect_uri", PAINT_CALLBACK_URL);
        authorizeUrl.searchParams.set("scope", PAINT_OAUTH_SCOPE);
        authorizeUrl.searchParams.set("state", state);

        res.redirect(authorizeUrl.toString());

    } catch(err) {
        logger.error(err);
        res.redirect(paintErrorRedirectUrl(req.query.designId));
    }
});

/**
 * GitHub redirects back here after the paint consent. The token is used to
 * open the issue and then dropped - never stored, logged, or returned.
 */
router.get("/github/callback/paint", requireAuth, async (req: Request, res: Response) => {
    const cookieValue = req.signedCookies?.[PAINT_STATE_COOKIE_NAME];
    res.clearCookie(PAINT_STATE_COOKIE_NAME, baseCookieOptions);
    let expected: { state?: string; designId?: string } | null = null;

    try {
        const { code, state } = req.query;
        expected = typeof cookieValue === "string" ? JSON.parse(cookieValue) : null;

        if (typeof code !== "string" || typeof state !== "string" || !expected?.state || state !== expected.state) {
            throw new Error("paint consent: invalid OAuth state or missing code.");
        }

        const accessToken = await exchangeCodeForToken(code, PAINT_CALLBACK_URL);
        await backfillService.openCanvasIssue(req.user!.id, expected!.designId as string, accessToken);

        res.redirect(`${config.FRONTEND_URL}/dashboard`);

    } catch(err) {
        logger.error(err);
        res.redirect(paintErrorRedirectUrl(expected?.designId));
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
