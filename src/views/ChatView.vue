<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { askQuestion, getHistory, clearHistory } from '@/api/chat'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()

/** 每条消息：{ role: 'user'|'ai', content, paths, sources, hitEntities, loading } */
const messages = ref([])
const input = ref('')
const sending = ref(false)
const loadingHistory = ref(false)

const listRef = ref(null)

async function send() {
  const question = input.value.trim()
  if (!question || sending.value) return

  // 先把用户问题上屏
  messages.value.push({ role: 'user', content: question })
  input.value = ''
  sending.value = true
  scrollToBottom()

  // 占位一条"思考中"的 AI 消息
  const aiMsg = { role: 'ai', content: '', loading: true, showPaths: false }
  messages.value.push(aiMsg)
  scrollToBottom()

  try {
    const startedAt = Date.now()
    const res = await askQuestion(question)
    aiMsg.content = res.answer
    aiMsg.paths = res.paths || []
    aiMsg.chains = res.chains || []
    aiMsg.sources = res.sources || []
    aiMsg.hitEntities = res.hitEntities || []
    // 前端侧耗时，和后端日志里记的那份基本一致，用于展示
    aiMsg.latencyMs = Date.now() - startedAt
    // 后端明确说「图谱里没有依据」时，隐藏溯源区，避免答案看着有出处
    aiMsg.hasEvidence = res.hasEvidence !== false
  } catch (e) {
    aiMsg.content = '问答失败：' + (e.message || '未知错误')
    aiMsg.hasEvidence = false
  } finally {
    aiMsg.loading = false
    sending.value = false
    scrollToBottom()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

/**
 * 把历史记录回填成消息数组。
 * 字段刻意和实时回答对齐（paths/sources/hitEntities/hasEvidence），
 * 这样模板里一套渲染逻辑就能同时吃「刚问的」和「历史里的」。
 */
async function loadHistory() {
  loadingHistory.value = true
  try {
    const rows = await getHistory(10)
    messages.value = rows.flatMap((r) => [
      { role: 'user', content: r.question },
      {
        role: 'ai',
        content: r.answer,
        paths: r.paths || [],
        chains: r.chains || [],
        sources: r.sources || [],
        hitEntities: r.hitEntities || [],
        hasEvidence: r.hasEvidence !== false,
        latencyMs: r.latencyMs,
        showPaths: false,
      },
    ])
    scrollToBottom()
  } catch (e) {
    // 历史加载失败不该挡住提问，降级成空列表
    console.warn('问答历史加载失败：', e.message)
  } finally {
    loadingHistory.value = false
  }
}

async function handleClear() {
  if (messages.value.length === 0 || sending.value) return
  if (!window.confirm('清空后问答历史不可恢复，确定吗？')) return
  try {
    await clearHistory()
    messages.value = []
  } catch (e) {
    window.alert('清空失败：' + (e.message || '未知错误'))
  }
}

onMounted(loadHistory)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="chat-page">
    <header>
      <h2>知识问答</h2>
      <span class="sub">基于你的知识图谱回答</span>
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="router.push('/graph')">图谱</button>
      <button @click="router.push('/notes')">笔记</button>
      <button @click="router.push('/dashboard')">统计</button>
      <button @click="router.push('/settings')">设置</button>
      <button :disabled="messages.length === 0 || sending" @click="handleClear">清空对话</button>
      <button @click="handleLogout">退出</button>
    </header>

    <div class="msg-list" ref="listRef">
      <p v-if="messages.length === 0 && !loadingHistory" class="empty">
        试着问：「RAG 和微调有什么区别？」
      </p>
      <p v-if="loadingHistory" class="empty">正在加载历史对话...</p>

      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
        <div class="bubble">{{ m.content }}</div>

        <div v-if="m.loading" class="typing">
          <span></span><span></span><span></span> 正在检索图谱并生成答案...
        </div>

        <!-- 查询日志里的耗时，历史记录里也有 -->
        <div v-if="m.role === 'ai' && !m.loading && m.latencyMs" class="latency">
          耗时 {{ (m.latencyMs / 1000).toFixed(1) }}s
        </div>

        <!-- 只有 AI 消息且拿到数据才展示依据 -->
        <div v-if="m.role === 'ai' && !m.loading && m.hasEvidence" class="evidence">
          <div class="ev-row">
            <span class="ev-label">命中实体</span>
            <span v-if="m.hitEntities.length === 0" class="muted">无</span>
            <span v-for="e in m.hitEntities" :key="e" class="chip">{{ e }}</span>
          </div>

          <div class="ev-row">
            <span class="ev-label">引用来源</span>
            <span v-if="m.sources.length === 0" class="muted">未找到相关笔记</span>
            <span v-for="s in m.sources" :key="s.noteId" class="chip source">
              《{{ s.noteTitle }}》
            </span>
          </div>

          <!-- 命中的原文片段：没有向量检索，就把命中实体定位到具体句子 -->
          <div v-if="m.sources.some(s => s.snippet)" class="ev-snippets">
            <div v-for="s in m.sources.filter(s => s.snippet)" :key="'snip-' + s.noteId" class="snippet">
              <div class="snippet-head">
                <span class="snippet-title">《{{ s.noteTitle }}》</span>
                <span v-if="s.score > 0" class="snippet-score">匹配度 {{ s.score.toFixed(2) }}</span>
                <span v-for="e in s.matchedEntities" :key="e" class="chip mini">{{ e }}</span>
              </div>
              <blockquote class="snippet-text">{{ s.snippet }}</blockquote>
            </div>
          </div>

          <div class="ev-toggle" @click="m.showPaths = !m.showPaths">
            {{ m.showPaths ? '收起' : '展开' }}图谱依据（{{
              m.chains && m.chains.length
                ? m.chains.length + ' 条链路 / ' + m.paths.length + ' 条关系'
                : m.paths.length + ' 条关系'
            }}）
          </div>

          <ul v-if="m.showPaths" class="paths">
            <template v-if="m.chains && m.chains.length">
              <li v-for="(c, j) in m.chains" :key="'chain-' + j" class="chain">
                <template v-for="(n, k) in c.nodes" :key="'n-' + k">
                  <b>{{ n }}</b>
                  <span v-if="k < c.edges.length" class="rel">→ {{ c.edges[k].relation }} →</span>
                </template>
              </li>
            </template>
            <template v-else>
              <li v-for="(p, j) in m.paths" :key="j">
                <b>{{ p.source }}</b>
                <span class="rel">{{ p.relation }}</span>
                <b>{{ p.target }}</b>
              </li>
            </template>
          </ul>
        </div>
      </div>
    </div>

    <div class="composer">
      <textarea
          v-model="input"
          rows="2"
          placeholder="输入问题，回车发送（Shift + 回车换行）"
          @keydown.enter.exact.prevent="send"
      ></textarea>
      <button class="send" :disabled="sending" @click="send">
        {{ sending ? '生成中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-page { width: 100%; height: 100%; display: flex; flex-direction: column; }
header {
  height: 56px; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px; background: #2c5364; color: #fff;
}
h2 { font-size: 18px; margin: 0; }
.sub { font-size: 12px; opacity: .7; }
.user { margin-left: auto; font-size: 13px; opacity: .85; }
header button {
  padding: 6px 14px; background: transparent; color: #fff;
  border: 1px solid rgba(255,255,255,.5); border-radius: 4px; cursor: pointer;
}
header button:disabled { opacity: .45; cursor: not-allowed; }

.msg-list {
  flex: 1; overflow-y: auto; padding: 24px;
  background: #fafafa; display: flex; flex-direction: column; gap: 16px;
}
.empty { text-align: center; color: #aaa; margin-top: 80px; }

.msg { display: flex; flex-direction: column; max-width: 76%; }
.msg.user { align-self: flex-end; align-items: flex-end; }
.msg.ai { align-self: flex-start; align-items: flex-start; }

.bubble {
  padding: 12px 16px; border-radius: 10px; font-size: 14px; line-height: 1.7;
  white-space: pre-wrap;      /* 关键：保留 answer 里的 \n 换行 */
  word-break: break-word;
}
.msg.user .bubble { background: #4e79a7; color: #fff; }
.msg.ai .bubble { background: #fff; border: 1px solid #e5e5e5; }

.typing { font-size: 12px; color: #999; margin-top: 6px; }
.latency { font-size: 11px; color: #aaa; margin-top: 4px; }
.typing span {
  display: inline-block; width: 5px; height: 5px; margin-right: 2px;
  background: #bbb; border-radius: 50%; animation: blink 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: .2s; }
.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }

.evidence {
  margin-top: 8px; padding: 10px 14px;
  background: #fff; border: 1px solid #eee; border-radius: 8px;
  font-size: 12px; width: 100%; box-sizing: border-box;
}
.ev-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.ev-label { color: #999; margin-right: 4px; }
.muted { color: #bbb; }
.chip {
  padding: 2px 8px; background: #eef2f5; border-radius: 10px; color: #555;
}
.chip.source { background: #fff3d6; color: #96680f; }
.chip.mini { padding: 0 6px; font-size: 11px; }

.ev-snippets { margin: 6px 0 8px; display: flex; flex-direction: column; gap: 8px; }
.snippet {
  padding: 8px 10px; background: #fffdf7;
  border-left: 3px solid #f0c36d; border-radius: 4px;
}
.snippet-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.snippet-title { color: #96680f; font-weight: 600; }
.snippet-score { color: #4e79a7; font-size: 11px; }
.snippet-text {
  margin: 0; color: #555; line-height: 1.7;
  white-space: pre-wrap; word-break: break-word;
}

.ev-toggle { color: #4e79a7; cursor: pointer; margin-top: 4px; }
.paths { list-style: none; margin: 8px 0 0; padding: 0; max-height: 220px; overflow-y: auto; }
.paths li { padding: 4px 0; border-bottom: 1px solid #f5f5f5; color: #666; }
.paths .rel {
  display: inline-block; margin: 0 6px; padding: 1px 6px;
  background: #e8f0fe; color: #3b6ea5; border-radius: 3px; font-size: 11px;
}
.paths .chain { line-height: 1.9; }
.paths .chain b { color: #333; }

.composer {
  flex-shrink: 0; display: flex; gap: 10px; padding: 14px 20px;
  border-top: 1px solid #e5e5e5; background: #fff;
}
.composer textarea {
  flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 14px; font-family: inherit; resize: none; outline: none;
}
.composer textarea:focus { border-color: #4e79a7; }
.send {
  padding: 0 24px; background: #4e79a7; color: #fff; border: none;
  border-radius: 6px; cursor: pointer; font-size: 14px;
}
.send:disabled { opacity: .6; cursor: not-allowed; }
</style>