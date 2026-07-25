import { fileURLToPath, URL } from "node:url"

import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vueDevTools from "vite-plugin-vue-devtools"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        // vueDevTools(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        },
    },
    base: "/",
    server: {
        // pinned + strict: port 5173 is durably occupied by an unrelated project on this machine,
        // and a silently-drifting port breaks the OAuth callback redirect (FRONTEND_URL must match)
        port: 5176,
        strictPort: true,
    },
})
