// Vue, Vue Router and Bootstrap are external libraries.
import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/theme.css'
import './assets/main.css'
import App from './App.vue'
import router from './router/index.js'
import { useCurrentUser } from './composables/useCurrentUser'
import { whenSessionEnds } from './services/api'
import { clearSessionToken } from './utils/sessionToken'
import { reloadForNewBuild } from './utils/staleBuild.js'

// A page file that fails to load after a redeploy reloads the tab (staleBuild.js).
window.addEventListener('vite:preloadError', (event) => reloadForNewBuild(event))

const app = createApp(App)
useCurrentUser()
  .refresh()
  .finally(() => {
    app.use(router).mount('#app')
    whenSessionEnds(() => {
      clearSessionToken()
      const { currentUser } = useCurrentUser()
      currentUser.value = null
      const pageNow = router.currentRoute.value
      if (pageNow.name !== 'login') {
        router.push({ name: 'login', query: { redirect: pageNow.fullPath } })
      }
    })
  })
