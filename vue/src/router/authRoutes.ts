// import SignUpView from "../views/signUp.vue";
// export const signUpRoute = {
//     path: "/signup", 
//     name: "SignUp", 
//     component: SignUpView, 
//     props: true,
// };


import SignUpView from "@/views/signUp/layout.vue";
import ConnectView from "@/views/signUp/connect.vue";
import ProfileView from "@/views/signUp/profile.vue";
import DoneView from "@/views/signUp/done.vue";

export const signUpRoute = {
    path: "/signup", 
    name: "SignUp", 
    component: SignUpView, 
    props: true,
    children: [
        {
            path: "connect",
            component: ConnectView,
        },
        {
            path: "profile",
            component: ProfileView,
        },
        {
            path: "done",
            component: DoneView,
        },
    ]
};
