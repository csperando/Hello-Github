import EditorView from "../views/Editor.vue";
import CheckoutView from "../views/Checkout.vue";
import DashboardView from "../views/Dashboard.vue";
import AdminLayout from "../components/admin/AdminLayout.vue";
import AdminPaymentsView from "../views/admin/AdminPayments.vue";
import AdminJobsView from "../views/admin/AdminJobs.vue";
import AdminUsersView from "../views/admin/AdminUsers.vue";
import AdminUserView from "../views/admin/AdminUser.vue";
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

// The admin console: a layout with a side nav, one child route per section.
// requiresAdmin on the parent covers every child (route meta is merged).
export const adminRoute = {
    path: "/admin",
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
        { path: "", redirect: "/admin/payments" },
        { path: "payments", name: "AdminPayments", component: AdminPaymentsView },
        { path: "jobs", name: "AdminJobs", component: AdminJobsView },
        { path: "users", name: "AdminUsers", component: AdminUsersView },
        { path: "users/:userId", name: "AdminUser", component: AdminUserView },
    ],
};

export const settingsRoute = {
    path: "/settings",
    name: "Settings",
    component: SettingsView,
    meta: { requiresAuth: true },
};
