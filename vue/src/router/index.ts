import { createRouter, createWebHistory } from "vue-router";

import * as auth from "./authRoutes";
import { homeRoute } from "./homeRoutes";
import { editorRoute, checkoutRoute, dashboardRoute } from "./appRoutes";
import { errorRoute, notFoundRoute } from "./errorRoutes";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
    routes: [
        homeRoute,
        auth.signUpRoute,
        editorRoute,
        checkoutRoute,
        dashboardRoute,
        errorRoute,
        notFoundRoute,
    ],
    history: createWebHistory("/"),
    scrollBehavior(to) {
        if (to.hash) {
            return { el: to.hash, behavior: "smooth" };
        }
        return { top: 0 };
    },
})

router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) return true;

    // reuses the in-flight promise from main.ts's boot-time fetchMe() call if it's still pending
    const authStore = useAuthStore();
    await authStore.fetchMe();

    if (!authStore.isAuthenticated) {
        return { path: "/signup" };
    }

    return true;
});

export default router
