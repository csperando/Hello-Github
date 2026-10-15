import type { RouteLocationNormalized } from "vue-router";
import ErrorView from "../views/Error.vue";

const VALID_ERROR_TYPES = ["404", "500", "github_disconnected", "paint_consent_failed"] as const;
type ErrorTypeKey = (typeof VALID_ERROR_TYPES)[number];

function firstQueryValue(raw: RouteLocationNormalized["query"][string] | undefined): string | undefined {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ?? undefined;
}

function resolveErrorType(route: RouteLocationNormalized): { errorType: ErrorTypeKey; designId?: string } {
    const type = firstQueryValue(route.query.type);
    const errorType = (VALID_ERROR_TYPES as readonly string[]).includes(type ?? "") ? (type as ErrorTypeKey) : "500";
    // paint_consent_failed carries the design so the page can offer a straight retry
    const designId = firstQueryValue(route.query.designId);
    return errorType === "paint_consent_failed" && designId ? { errorType, designId } : { errorType };
}

export const errorRoute = {
    path: "/error",
    name: "Error",
    component: ErrorView,
    props: resolveErrorType,
};

// Catch-all — must stay last in the routes array so it never shadows a real route.
export const notFoundRoute = {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: ErrorView,
    props: { errorType: "404" as const },
};
