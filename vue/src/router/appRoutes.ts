import EditorView from "../views/Editor.vue";
import CheckoutView from "../views/Checkout.vue";
import DashboardView from "../views/Dashboard.vue";
import AdminView from "../views/Admin.vue";
import SettingsView from "../views/Settings.vue";

export const editorRoute = {
    path: "/editor/:designId?",
    name: "Editor",
    component: EditorView,
    meta: { requiresAuth: true },
};

export const checkoutRoute = {
    path: "/checkout",
    name: "Checkout",
    component: CheckoutView,
    meta: { requiresAuth: true },
};

export const dashboardRoute = {
    path: "/dashboard",
    name: "Dashboard",
    component: DashboardView,
    meta: { requiresAuth: true },
};

export const adminRoute = {
    path: "/admin",
    name: "Admin",
    component: AdminView,
    meta: { requiresAuth: true, requiresAdmin: true },
};

export const settingsRoute = {
    path: "/settings",
    name: "Settings",
    component: SettingsView,
    meta: { requiresAuth: true },
};
