<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await login(form.value.username, form.value.password)
    authStore.setAuth(data.token, data.username)
    router.push('/graph')
  } catch (e) {
    errorMsg.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <h1>知网星图</h1>
      <p class="subtitle">面向 AI 大模型领域的知识图谱与 GraphRAG 问答系统</p>

      <input v-model="form.username" placeholder="用户名" @keyup.enter="handleLogin" />
      <input v-model="form.password" type="password" placeholder="密码" @keyup.enter="handleLogin" />

      <button :disabled="loading" @click="handleLogin">
        {{ loading ? '登录中...' : '登录' }}
      </button>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
}
.login-box {
  width: 360px;
  padding: 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .3);
  text-align: center;
}
h1 { margin: 0 0 8px; color: #2c5364; }
.subtitle { font-size: 13px; color: #888; margin-bottom: 24px; }
input {
  width: 100%;
  padding: 12px;
  margin-bottom: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-sizing: border-box;
  font-size: 14px;
}
button {
  width: 100%;
  padding: 12px;
  background: #2c5364;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
}
button:disabled { opacity: .6; cursor: not-allowed; }
.error { color: #e74c3c; font-size: 13px; margin-top: 12px; }
</style>
