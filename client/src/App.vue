<script setup>
// Application root: the top bar with the profile chip, the sidebar on wide
// screens and the phone menu, around whichever page the router shows.
import { ref, computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { navigation, classroomNavigation } from './config/navigation.js'
import UserAvatar from './components/shared/UserAvatar.vue'
import AppIcon from './components/shared/AppIcon.vue'
import { useCurrentUser } from './composables/useCurrentUser.js'
import { usePageClassroom } from './composables/usePageClassroom.js'

const route = useRoute()
const router = useRouter()

const { currentUserId, currentUser, logout } = useCurrentUser()
const { pageClassroomId } = usePageClassroom()

// The challenge and mini-project addresses carry no classroom, so those pages
// report theirs through usePageClassroom once loaded. Any other page ignores
// an id left over from them, so the classroom links never point somewhere stale.
const classroomId = computed(() => {
  if (route.params.classroomId) {
    return route.params.classroomId
  } else if (route.name === 'challenge' || route.name === 'mini-project') {
    return pageClassroomId.value
  } else {
    return ''
  }
})
const chipName = computed(() => currentUser.value?.displayName ?? '')

async function onLogout() {
  menuOpen.value = false
  await router.push({ name: 'login' })
  await logout()
}

// Vue owns the mobile menu state so choosing a link can close it; Bootstrap CSS still styles it.
const menuOpen = ref(false)

const links = computed(() => {
  if (!classroomId.value) {
    return navigation
  } else {
    return [...navigation, ...classroomNavigation(classroomId.value)]
  }
})

const sectionClass = computed(() => {
  if (route.meta.section) {
    return `section-${route.meta.section}`
  } else {
    return null
  }
})
</script>

<template>
  <div class="app-layout" :class="[sectionClass, { 'app-layout-solo': !currentUserId }]">
    <header class="app-bar">
      <div class="app-bar-inner">
        <h1 class="app-wordmark" :class="{ 'd-md-none': currentUserId }">Learn-E</h1>
        <RouterLink
          v-if="chipName"
          :to="{ name: 'profile', params: { userId: currentUserId } }"
          class="app-chip"
        >
          <UserAvatar :user-id="currentUserId" :display-name="chipName" size="2rem" />
          <span class="app-chip-name">{{ chipName }}</span>
        </RouterLink>
        <nav
          v-if="currentUserId"
          class="navbar navbar-expand-md app-nav-wrap d-md-none"
          aria-label="Primary navigation"
        >
          <button
            class="navbar-toggler"
            type="button"
            aria-controls="primary-navigation"
            :aria-expanded="menuOpen"
            aria-label="Toggle primary navigation"
            @click="menuOpen = !menuOpen"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          <div id="primary-navigation" class="collapse navbar-collapse" :class="{ show: menuOpen }">
            <ul class="navbar-nav app-nav">
              <li v-for="item in links" :key="item.label" class="nav-item">
                <RouterLink :to="item.to" class="nav-link" @click="menuOpen = false"
                  ><AppIcon :name="item.icon" />{{ item.label }}</RouterLink
                >
              </li>
              <template v-if="currentUserId">
                <li class="nav-item app-nav-account">
                  <RouterLink
                    :to="{ name: 'profile', params: { userId: currentUserId } }"
                    class="nav-link"
                    @click="menuOpen = false"
                    ><AppIcon name="profile" />Your profile</RouterLink
                  >
                </li>
                <li class="nav-item">
                  <button type="button" class="nav-link app-logout" @click="onLogout">
                    <AppIcon name="logout" />Log out
                  </button>
                </li>
              </template>
            </ul>
          </div>
        </nav>
      </div>
    </header>
    <aside v-if="currentUserId" class="app-sidebar d-none d-md-block">
      <div class="app-sidebar-inner">
        <h1 class="app-wordmark">Learn-E</h1>
        <nav class="app-sidebar-nav" aria-label="Primary navigation">
          <div class="app-nav-group">
            <p id="nav-group-overview" class="app-nav-label">Overview</p>
            <ul class="nav flex-column app-nav" aria-labelledby="nav-group-overview">
              <li v-for="item in navigation" :key="item.label" class="nav-item">
                <RouterLink :to="item.to" class="nav-link"
                  ><AppIcon :name="item.icon" />{{ item.label }}</RouterLink
                >
              </li>
            </ul>
          </div>
          <div v-if="classroomId" class="app-nav-group">
            <p id="nav-group-classroom" class="app-nav-label">This classroom</p>
            <ul class="nav flex-column app-nav" aria-labelledby="nav-group-classroom">
              <li
                v-for="item in classroomNavigation(classroomId)"
                :key="item.label"
                class="nav-item"
              >
                <RouterLink :to="item.to" class="nav-link"
                  ><AppIcon :name="item.icon" />{{ item.label }}</RouterLink
                >
              </li>
            </ul>
          </div>
          <div v-if="currentUserId" class="app-nav-group app-nav-account">
            <p id="nav-group-account" class="app-nav-label">Account</p>
            <ul class="nav flex-column app-nav" aria-labelledby="nav-group-account">
              <li class="nav-item">
                <RouterLink
                  :to="{ name: 'profile', params: { userId: currentUserId } }"
                  class="nav-link"
                  ><AppIcon name="profile" />Your profile</RouterLink
                >
              </li>
              <li class="nav-item">
                <button type="button" class="nav-link app-logout" @click="onLogout">
                  <AppIcon name="logout" />Log out
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </aside>
    <main class="app-main">
      <!-- le-view gives every page one root, even a view with several, so theme.css
           can cap the page width and the section class sets one colour family. -->
      <RouterView v-slot="{ Component, route }">
        <div class="le-view" :class="route.meta.section ? `section-${route.meta.section}` : null">
          <component :is="Component" />
        </div>
      </RouterView>
    </main>
  </div>
</template>
