import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

import './main.css';

const app = createApp(App)

app.use(createPinia())
app.use(router)

// fire-and-forget: don't gate first paint on a network round-trip
useAuthStore().fetchMe()

app.mount('#app')
