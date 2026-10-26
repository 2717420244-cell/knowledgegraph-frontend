<script setup>
import { ref, onMounted } from 'vue'
import {
  listNotes, getNote, createNote, updateNote, deleteNote, searchNotes, parseNote
} from '@/api/notes'
import { importSampleNotes, SAMPLE_NOTES } from '@/api/samples'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()

const notes = ref([])
const loading = ref(false)
const errorMsg = ref('')

// 示例笔记导入状态（空状态引导）
const importing = ref(false)
const importProgress = ref(null)   // { index, total, title, phase }

// 编辑弹窗
const showDialog = ref(false)
const editingId = ref(null)
const form = ref({ title: '', content: '', sourceUrl: '' })

// 搜索
const keyword = ref('')

// 正在解析的笔记 id
const parsingId = ref(null)

onMounted(() => loadNotes())

async function loadNotes() {
  loading.value = true
  errorMsg.value = ''
  try {
    notes.value = await listNotes(1, 50)
  } catch (e) {
    errorMsg.value = e.message || '加载笔记失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { title: '', content: '', sourceUrl: '' }
  showDialog.value = true
}

async function openEdit(note) {
  editingId.value = note.id
  // 列表接口不返回正文，这里单独拉一次详情
  const detail = await getNote(note.id)
  form.value = {
    title: detail.title,
    content: detail.content,
    sourceUrl: detail.sourceUrl || ''
  }
  showDialog.value = true
}

async function submitForm() {
  try {
    if (editingId.value) {
      await updateNote(editingId.value, form.value)
    } else {
      await createNote(form.value)
    }
    showDialog.value = false
    await loadNotes()
  } catch (e) {
    alert('保存失败：' + (e.message || '未知错误'))
  }
}

async function remove(note) {
  if (!confirm(`确定删除《${note.title}》吗？`)) return
  try {
    await deleteNote(note.id)
    await loadNotes()
  } catch (e) {
    alert('删除失败：' + (e.message || '未知错误'))
  }
}

/**
 * 解析笔记。这个要等 10~30 秒，必须有 loading。
 */
async function parse(note) {
  if (!confirm(`解析《${note.title}》？会调用大模型抽取实体关系，需要 10~30 秒。`)) return
  parsingId.value = note.id
  try {
    const result = await parseNote(note.id)
    alert(`解析完成！新增 ${result.nodeCount} 个实体，${result.edgeCount} 条关系。`)
    await loadNotes()
  } catch (e) {
    alert('解析失败：' + (e.message || '未知错误'))
  } finally {
    parsingId.value = null
  }
}

async function handleSearch() {
  if (!keyword.value.trim()) {
    await loadNotes()
    return
  }
  loading.value = true
  try {
    notes.value = await searchNotes(keyword.value.trim())
  } catch (e) {
    errorMsg.value = e.message || '搜索失败'
  } finally {
    loading.value = false
  }
}

function statusText(status) {
  return { draft: '未解析', parsed: '已解析', archived: '已归档' }[status] || status
}

/**
 * 一键导入示例笔记（空状态引导）。
 * 每篇要等 LLM 解析 10~30 秒，全程显示进度，导入完刷新列表。
 */
async function handleImportSamples() {
  if (!confirm(`将载入 ${SAMPLE_NOTES.length} 篇 AI 示例笔记并自动调用大模型解析，共需 1~3 分钟。现在开始吗？`)) return
  importing.value = true
  importProgress.value = null
  try {
    const { created, parsed, failed } = await importSampleNotes({
      onProgress: p => { importProgress.value = p }
    })
    await loadNotes()
    let msg = `导入完成：成功 ${created} 篇，已解析 ${parsed} 篇`
    if (failed > 0) msg += `，失败 ${failed} 篇（可稍后在列表中手动点「解析」重试）`
    alert(msg)
  } catch (e) {
    alert('导入失败：' + (e.message || '未知错误'))
  } finally {
    importing.value = false
    importProgress.value = null
  }
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="notes-page">
    <header>
      <h2>我的笔记</h2>
      <button class="primary" @click="openCreate">+ 新建笔记</button>
      <input
          class="header-input"
          v-model="keyword"
          placeholder="搜索笔记标题"
          @keyup.enter="handleSearch"
      />
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="router.push('/graph')">看图谱</button>
      <button @click="router.push('/chat')">问答</button>
      <button @click="router.push('/dashboard')">统计</button>
      <button @click="handleLogout">退出</button>
    </header>

    <p v-if="loading" class="tip">加载中...</p>
    <p v-if="errorMsg" class="tip error">{{ errorMsg }}</p>

    <div class="list">
      <div v-for="note in notes" :key="note.id" class="note-card">
        <div class="note-main">
          <h3>{{ note.title }}</h3>
          <p class="meta">
            <span class="badge" :class="note.status">{{ statusText(note.status) }}</span>
            <span>{{ note.fileType }}</span>
            <span>{{ new Date(note.createdAt).toLocaleString() }}</span>
          </p>
        </div>
        <div class="actions">
          <button
              class="primary"
              :disabled="parsingId === note.id"
              @click="parse(note)"
          >
            {{ parsingId === note.id ? '解析中...' : '解析' }}
          </button>
          <button @click="openEdit(note)">编辑</button>
          <button class="danger" @click="remove(note)">删除</button>
        </div>
      </div>

      <div v-if="!loading && notes.length === 0 && !importing" class="empty">
        <p class="empty-title">还没有笔记</p>
        <p class="empty-desc">从零体验要写笔记、等解析，不如先载入示例笔记 ——
          5 篇 AI 主题笔记自动解析成图谱，直接看完整效果。</p>
        <button class="primary big" @click="handleImportSamples">
          载入示例笔记（{{ SAMPLE_NOTES.length }} 篇，约 1~3 分钟）
        </button>
        <p class="empty-tip">或点右上角「新建笔记」，自己写一篇</p>
      </div>

      <!-- 导入进度 -->
      <div v-if="importing" class="empty importing">
        <p class="empty-title">正在导入示例笔记...</p>
        <p v-if="importProgress" class="empty-desc">
          第 {{ importProgress.index + 1 }} / {{ importProgress.total }} 篇：《{{ importProgress.title }}》
          {{ importProgress.phase === 'creating' ? '（创建中）' : '（大模型解析中，约 10~30 秒）' }}
        </p>
        <div class="progress-bar">
          <div
              class="progress-inner"
              :style="{ width: importProgress ? ((importProgress.index + 1) / importProgress.total * 100) + '%' : '0%' }"
          ></div>
        </div>
        <p class="empty-tip">导入期间请勿关闭或刷新页面</p>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗 -->
    <div v-if="showDialog" class="mask" @click.self="showDialog = false">
      <div class="dialog">
        <h3>{{ editingId ? '编辑笔记' : '新建笔记' }}</h3>

        <input v-model="form.title" placeholder="标题" />
        <textarea v-model="form.content" rows="12" placeholder="正文（Markdown）"></textarea>
        <input v-model="form.sourceUrl" placeholder="原文链接（选填）" />

        <div class="dialog-actions">
          <button @click="showDialog = false">取消</button>
          <button class="primary" @click="submitForm">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-page { width: 100%; height: 100%; display: flex; flex-direction: column; }
header {
  height: 56px; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px; background: #2c5364; color: #fff;
}
h2 { font-size: 18px; margin: 0; }
.header-input {
  width: 200px; padding: 6px 12px;
  border: 1px solid rgba(255,255,255,.35); border-radius: 4px;
  background: rgba(255,255,255,.12); color: #fff; font-size: 13px; outline: none;
}
.header-input::placeholder { color: rgba(255,255,255,.5); }
.user { margin-left: auto; font-size: 13px; opacity: .85; }
header button {
  padding: 6px 14px; background: transparent; color: #fff;
  border: 1px solid rgba(255,255,255,.5); border-radius: 4px; cursor: pointer;
}
header button.primary { background: #4e79a7; border-color: #4e79a7; }

.list { flex: 1; overflow-y: auto; padding: 20px; background: #fafafa; }
.note-card {
  background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
  padding: 16px 20px; margin-bottom: 12px;
  display: flex; align-items: center; gap: 16px;
}
.note-main { flex: 1; min-width: 0; }
.note-main h3 { margin: 0 0 6px; font-size: 16px; }
.meta { font-size: 12px; color: #999; display: flex; gap: 12px; align-items: center; }
.badge {
  padding: 2px 8px; border-radius: 10px; font-size: 11px;
  background: #eee; color: #666;
}
.badge.parsed { background: #e3f2e1; color: #3c7a2e; }
.badge.draft { background: #fff3d6; color: #96680f; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.actions button {
  padding: 6px 12px; border: 1px solid #ddd; background: #fff;
  border-radius: 4px; cursor: pointer; font-size: 13px;
}
.actions button.primary { background: #4e79a7; color: #fff; border-color: #4e79a7; }
.actions button.danger { color: #e74c3c; border-color: #f5c6c6; }
.empty {
  text-align: center; color: #999; padding: 60px 0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.empty-title { font-size: 18px; color: #555; margin: 0; font-weight: 600; }
.empty-desc { font-size: 13px; color: #888; margin: 0; max-width: 420px; line-height: 1.6; }
.empty-tip { font-size: 12px; color: #bbb; margin: 6px 0 0; }
.empty button.big {
  padding: 10px 26px; font-size: 14px;
  background: #4e79a7; color: #fff; border: none;
  border-radius: 6px; cursor: pointer;
}
.empty button.big:hover { background: #3d6489; }
.empty.importing { padding: 80px 0; }
.progress-bar {
  width: 320px; height: 8px; border-radius: 4px;
  background: #eee; overflow: hidden; margin-top: 6px;
}
.progress-inner {
  height: 100%; background: #4e79a7;
  border-radius: 4px; transition: width .3s;
}
.tip { padding: 12px 20px; font-size: 13px; color: #666; }
.error { color: #e74c3c; }

.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.dialog {
  width: 520px; background: #fff; border-radius: 10px; padding: 24px;
  display: flex; flex-direction: column; gap: 12px;
}
.dialog h3 { margin: 0; }
.dialog input, .dialog textarea {
  width: 100%; padding: 10px; border: 1px solid #ddd;
  border-radius: 6px; box-sizing: border-box; font-size: 14px;
  font-family: inherit; resize: vertical;
}
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
.dialog-actions button {
  padding: 8px 18px; border: 1px solid #ddd; background: #fff;
  border-radius: 4px; cursor: pointer;
}
.dialog-actions button.primary { background: #4e79a7; color: #fff; border-color: #4e79a7; }
</style>