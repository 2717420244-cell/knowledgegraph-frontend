<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getPrompt, savePrompt, resetPrompt } from '@/api/prompt'

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const content = ref('')
const defaultContent = ref('')
const customized = ref(false)
const updatedAt = ref(null)
const message = ref('')
const messageType = ref('')   // ok | error

const charCount = computed(() => content.value.length)
// 上次保存/加载时的内容：用来判断有没有改动，没改动就不让点保存
const savedContent = ref('')
const dirty = computed(() => content.value.trim() !== (savedContent.value || '').trim())

// 保存前先做和后端一致的检查，避免白跑一次请求
const tooShort = computed(() => content.value.trim().length > 0 && content.value.trim().length < 20)
const canSave = computed(() => !saving.value && content.value.trim().length >= 20 && dirty.value)

function flash(msg, type = 'ok') {
  message.value = msg
  messageType.value = type
}

async function load() {
  loading.value = true
  try {
    const data = await getPrompt()
    content.value = data.content || ''
    savedContent.value = data.content || ''
    defaultContent.value = data.defaultContent || ''
    customized.value = !!data.customized
    updatedAt.value = data.updatedAt || null
    message.value = ''
  } catch (e) {
    flash('加载失败：' + (e.message || '未知错误'), 'error')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const data = await savePrompt(content.value)
    content.value = data.content
    savedContent.value = data.content
    customized.value = !!data.customized
    updatedAt.value = data.updatedAt || null
    flash('已保存。下一次解析笔记时生效（已解析过的笔记需要重新解析才会用新 Prompt）。')
  } catch (e) {
    flash('保存失败：' + (e.message || '未知错误'), 'error')
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  if (!window.confirm('恢复默认会丢掉你自定义的 Prompt，确定吗？')) return
  saving.value = true
  try {
    const data = await resetPrompt()
    content.value = data.content
    savedContent.value = data.content
    customized.value = !!data.customized
    updatedAt.value = null
    flash('已恢复内置默认 Prompt。')
  } catch (e) {
    flash('恢复失败：' + (e.message || '未知错误'), 'error')
  } finally {
    saving.value = false
  }
}

function fillDefault() {
  content.value = defaultContent.value
  flash('已填入默认值，点「保存」后生效。')
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(load)
</script>

<template>
  <div class="settings-page">
    <header>
      <h2>设置</h2>
      <span class="sub">抽取 Prompt 可自定义</span>
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="router.push('/graph')">图谱</button>
      <button @click="router.push('/notes')">笔记</button>
      <button @click="router.push('/chat')">问答</button>
      <button @click="router.push('/dashboard')">统计</button>
      <button @click="handleLogout">退出</button>
    </header>

    <p v-if="message" class="tip" :class="messageType">{{ message }}</p>
    <p v-if="loading" class="tip">加载中...</p>

    <section class="card">
      <div class="card-head">
        <h3>抽取 Prompt</h3>
        <span class="badge" :class="{ custom: customized }">
          {{ customized ? '自定义' : '内置默认' }}
        </span>
        <span v-if="updatedAt" class="meta">最近修改：{{ updatedAt }}</span>
      </div>

      <p class="hint">
        这段文字会作为 system prompt 拼在笔记正文前面发给大模型。
        改它可以调整抽取的实体类型、命名规范、关系种类和数量范围；
        <b>输出必须是 <code>{"nodes": [...], "edges": [...]}</code> 这个 JSON 结构</b>，
        否则解析会失败（失败会自动重试 3 次，再不行降级为规则抽取）。
      </p>

      <textarea
        v-model="content"
        class="editor"
        spellcheck="false"
        placeholder="这里写抽取用的 system prompt..."
      ></textarea>

      <div class="editor-foot">
        <span class="count" :class="{ warn: tooShort || charCount > 4000 }">
          {{ charCount }} 字符（20—4000）
        </span>
        <span v-if="tooShort" class="count warn">太短了，至少 20 个字符</span>
        <button :disabled="!canSave" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>
        <button :disabled="saving" @click="fillDefault">填入默认值</button>
        <button class="danger" :disabled="saving || !customized" @click="handleReset">恢复默认</button>
      </div>

      <details class="default-box">
        <summary>查看内置默认 Prompt</summary>
        <pre>{{ defaultContent }}</pre>
      </details>
    </section>
  </div>
</template>

<style scoped>
.settings-page { max-width: 980px; margin: 0 auto; padding: 16px 20px 60px; }
header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
header h2 { font-size: 18px; margin: 0; }
.sub, .meta { color: #888; font-size: 12px; }
.user { margin-left: auto; color: #666; font-size: 13px; }
button {
  padding: 5px 12px; border: 1px solid #d0d5dd; background: #fff;
  border-radius: 6px; cursor: pointer; font-size: 13px;
}
button:hover:not(:disabled) { background: #f5f6f8; }
button:disabled { opacity: .55; cursor: not-allowed; }
button.danger { color: #c0392b; border-color: #e6b3ad; }

.tip { padding: 8px 12px; border-radius: 6px; font-size: 13px; background: #f2f4f7; color: #555; }
.tip.ok { background: #eaf7ee; color: #2f7a45; }
.tip.error { background: #fdeceb; color: #c0392b; }

.card { border: 1px solid #e4e7ec; border-radius: 10px; padding: 16px; margin-top: 12px; }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.card-head h3 { font-size: 15px; margin: 0; }
.badge { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: #eef2f6; color: #5b6b7c; }
.badge.custom { background: #fff4e5; color: #a8621b; }
.hint { font-size: 12.5px; color: #667085; line-height: 1.7; margin: 6px 0 12px; }
.hint code { background: #f4f6f8; padding: 1px 4px; border-radius: 4px; }

.editor {
  width: 100%; min-height: 340px; resize: vertical;
  font-family: ui-monospace, Consolas, monospace; font-size: 13px; line-height: 1.7;
  padding: 12px; border: 1px solid #d0d5dd; border-radius: 8px; box-sizing: border-box;
  white-space: pre-wrap;
}
.editor:focus { outline: none; border-color: #7fa7d8; box-shadow: 0 0 0 3px rgba(127,167,216,.15); }

.editor-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.count { font-size: 12px; color: #98a2b3; }
.count.warn { color: #c0392b; }
.editor-foot button:first-of-type { margin-left: auto; }

.default-box { margin-top: 14px; font-size: 12.5px; color: #667085; }
.default-box summary { cursor: pointer; }
.default-box pre {
  white-space: pre-wrap; background: #f8f9fb; border: 1px solid #eef0f3;
  border-radius: 8px; padding: 12px; margin-top: 8px; line-height: 1.7; color: #475467;
}
</style>
