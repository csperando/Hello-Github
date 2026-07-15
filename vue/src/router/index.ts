import { createRouter, createWebHistory } from "vue-router";

import * as auth from "./authRoutes";
import { homeRoute } from "./homeRoutes";
import { editorRoute, checkoutRoute, dashboardRoute } from "./appRoutes";
import { errorRoute, notFoundRoute } from "./errorRoutes";

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
    history: createWebHistory("/Hello-Github/"),
    scrollBehavior(to) {
        if (to.hash) {
            return { el: to.hash, behavior: "smooth" };
        }
        return { top: 0 };
    },
})

export default router
