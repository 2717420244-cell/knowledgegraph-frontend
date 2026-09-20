import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import GraphView from '@/views/GraphView.vue'

const routes = [
  { path: '/login', component: LoginView },
  { path: '/graph', component: GraphView, meta: { requiresAuth: true } },
  { path: '/', redirect: '/graph' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局前置守卫：没登录就踢回登录页
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/graph')
  } else {
    next()
  }
})

export default router