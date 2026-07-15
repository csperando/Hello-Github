import type { RouteLocationNormalized } from "vue-router";
import ErrorView from "../views/Error.vue";

const VALID_ERROR_TYPES = ["404", "500", "github_disconnected"] as const;
type ErrorTypeKey = (typeof VALID_ERROR_TYPES)[number];

function resolveErrorType(route: RouteLocationNormalized): { errorType: ErrorTypeKey } {
    const raw = route.query.type;
    const type = Array.isArray(raw) ? raw[0] : raw;
    return {
        errorType: (VALID_ERROR_TYPES as readonly string[]).includes(type ?? "") ? (type as ErrorTypeKey) : "500",
    };
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
