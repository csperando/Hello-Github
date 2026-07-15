import EditorView from "../views/Editor.vue";
import CheckoutView from "../views/Checkout.vue";
import DashboardView from "../views/Dashboard.vue";

export const editorRoute = {
    path: "/editor",
    name: "Editor",
    component: EditorView,
};

export const checkoutRoute = {
    path: "/checkout",
    name: "Checkout",
    component: CheckoutView,
};

export const dashboardRoute = {
    path: "/dashboard",
    name: "Dashboard",
    component: DashboardView,
};
