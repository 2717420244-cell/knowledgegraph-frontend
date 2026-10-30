<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { getOverview, getSubgraph, getNodeDetail, searchNodes } from '@/api/graph'
import { createNote, parseNote } from '@/api/notes'

const router = useRouter()
const authStore = useAuthStore()

const svgRef = ref(null)
const loading = ref(false)
const errorMsg = ref('')
const graphNotice = ref('')
const selectedNode = ref(null)

// 轻提示：4 秒后自动消失，避免一次失败把错误条永久钉在页面上
let tipTimer = null
function flashError(msg) {
  errorMsg.value = msg
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => { errorMsg.value = '' }, 4000)
}

async function selectNode(d) {
  // Document 等非实体节点没有 name，按 name 查详情只会拿到 404
  if (!d || !d.name) {
    flashError('该节点不是实体，没有详情可查')
    return
  }
  try {
    selectedNode.value = await getNodeDetail(d.name)
  } catch (e) {
    selectedNode.value = null
    flashError('节点详情加载失败：' + (e.message || '未知错误'))
  }
}

async function expandNode(d) {
  if (!d || !d.name) {
    flashError('该节点不是实体，无法展开')
    return
  }
  loading.value = true
  try {
    const data = await getSubgraph(d.name, 2)
    // 子图为空时不要 render：render 会先清空画布，
    // 结果就是"双击一下，整张图没了"
    if (!data || !data.nodes || data.nodes.length === 0) {
      flashError(`「${d.name}」暂无关联实体`)
      return
    }
    render(data)
  } catch (e) {
    flashError('加载子图失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const keyword = ref('')

async function handleSearch() {
  if (!keyword.value.trim()) return
  try {
    const results = await searchNodes(keyword.value.trim())
    if (results.length === 0) {
      alert('没找到相关知识点')
      return
    }
    await expandNode({ name: results[0].name })
  } catch (e) {
    alert('搜索失败：' + (e.message || '未知错误'))
  }
}

const showCreateDialog = ref(false)
const creating = ref(false)
const newNote = ref({ title: '', content: '' })

/**
 * 新建笔记并立刻解析，解析完刷新图谱。
 */
async function createAndParse() {
  if (!newNote.value.title.trim() || !newNote.value.content.trim()) {
    alert('标题和正文都要填')
    return
  }
  creating.value = true
  try {
    const note = await createNote({
      title: newNote.value.title,
      content: newNote.value.content
    })
    await parseNote(note.id)
    showCreateDialog.value = false
    newNote.value = { title: '', content: '' }
    await loadOverview()      // 重新拉图谱，新节点立刻出现
  } catch (e) {
    alert('失败：' + (e.message || '未知错误'))
  } finally {
    creating.value = false
  }
}

let simulation = null

// 不同标签用不同颜色（只列实体：Document 是笔记本身，不进图谱）
const LABEL_COLORS = {
  Concept: '#4e79a7',
  Person: '#e15759',
  Event: '#76b7b2'
}

function colorOf(label) {
  return LABEL_COLORS[label] || '#999'
}

// 被隐藏的标签集合（点击图例切换）
const hiddenLabels = ref(new Set())

/** 图例点击：隐藏/显示某类实体 */
function toggleLabel(label) {
  if (hiddenLabels.value.has(label)) {
    hiddenLabels.value.delete(label)
  } else {
    hiddenLabels.value.add(label)
  }
  // 触发响应式更新（Set 原地修改不会触发，需整体替换）
  hiddenLabels.value = new Set(hiddenLabels.value)
  applyLabelFilter()
}

/** 判断节点当前是否可见（未隐藏标签） */
function isNodeVisible(d) {
  return !hiddenLabels.value.has(d.label)
}

/** 根据隐藏标签更新节点/连线透明度与可交互性 */
function applyLabelFilter() {
  const svg = d3.select(svgRef.value)
  const nodeSel = svg.selectAll('circle')
  const linkSel = svg.selectAll('g > line')
  const labelSel = svg.selectAll('text')

  nodeSel
      .style('opacity', d => isNodeVisible(d) ? 1 : 0.08)
      .style('pointer-events', d => isNodeVisible(d) ? 'auto' : 'none')
  labelSel.style('opacity', d => isNodeVisible(d) ? 1 : 0.05)
  linkSel.style('opacity', d => {
    const visible = isNodeVisible(d.source) && isNodeVisible(d.target)
    return visible ? 0.6 : 0.03
  })
}

/** 悬停高亮：该节点及其邻居保持高亮，其余降透明度 */
function highlightNeighbors(d, hovered) {
  const svg = d3.select(svgRef.value)

  // 邻居集合（d3 把 link 的 source/target 替换成了节点对象，直接可用）
  const neighborIds = new Set([d.id])
  svg.selectAll('g > line').each(function (l) {
    if (l.source.id === d.id) neighborIds.add(l.target.id)
    if (l.target.id === d.id) neighborIds.add(l.source.id)
  })

  svg.selectAll('circle')
      .style('opacity', n => neighborIds.has(n.id) && isNodeVisible(n) ? 1 : 0.12)
  svg.selectAll('text')
      .style('opacity', n => neighborIds.has(n.id) && isNodeVisible(n) ? 1 : 0.05)
  svg.selectAll('g > line')
      .style('opacity', l => {
        const touched = l.source.id === d.id || l.target.id === d.id
        const visible = isNodeVisible(l.source) && isNodeVisible(l.target)
        return touched && visible ? 1 : 0.04
      })
}

/** 取消悬停：恢复到"仅按标签过滤"的状态 */
function clearHighlight() {
  applyLabelFilter()
}

onMounted(async () => {
  await loadOverview()
})

onUnmounted(() => {
  // 组件销毁时必须停掉仿真，否则它会在后台一直算，内存泄漏
  simulation?.stop()
  // 顺手清掉错误提示的定时器，避免刷新到别的页面后还去改已卸载组件的状态
  clearTimeout(tipTimer)
})

async function loadOverview() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getOverview(300)
    render(data)
  } catch (e) {
    errorMsg.value = e.message || '加载图谱失败'
  } finally {
    loading.value = false
  }
}

/**
 * 渲染力导向图。
 * data: { nodes: [{id, name, label, degree}], edges: [{source, target, relation}] }
 */
function render(data) {
  const el = svgRef.value
  if (!el) return

  // 节点过多时后端只返回关联度最高的一批，这里明说一句，避免用户以为图谱漏了东西
  graphNotice.value = data.truncated
    ? `图谱共 ${data.totalNodes} 个实体，当前只展示关联度最高的 ${data.nodes.length} 个（双击节点可下钻查看局部）`
    : ''

  const width = el.clientWidth
  const height = el.clientHeight

  // 重新渲染前先停掉旧的仿真并清空画布
  simulation?.stop()
  d3.select(el).selectAll('*').remove()

  // 必须深拷贝：d3 会把 edges 里的 source/target 从字符串替换成节点对象，
  // 直接改原数据会导致二次渲染时 id 对不上
  const nodes = data.nodes.map(n => ({ ...n }))
  const links = data.edges.map(e => ({ ...e }))

  const svg = d3.select(el)

  // 缩放容器（后面加 zoom 用）
  const container = svg.append('g')

  const zoom = d3.zoom()
      .scaleExtent([0.2, 5])          // 缩放范围
      .on('zoom', (event) => {
        container.attr('transform', event.transform)
      })

  svg.call(zoom)

  // ---------- 力学仿真 ----------
  simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))   // 负值 = 互相排斥
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 4))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))

  // ---------- 画连线 ----------
  const link = container.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#aaa')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5)

  // ---------- 画节点 ----------
  const node = container.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => colorOf(d.label))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(dragBehavior())
      .on('mouseenter', (event, d) => {
        highlightNeighbors(d, true)
      })
      .on('mouseleave', () => {
        clearHighlight()
      })
      .on('click', (event, d) => {
        selectNode(d)
      })
      .on('dblclick', (event, d) => {
        expandNode(d)
      })

  // ---------- 画标签 ----------
  const label = container.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.name)
      .attr('font-size', 12)
      .attr('fill', '#333')
      .attr('dx', d => nodeRadius(d) + 4)
      .attr('dy', 4)
      .style('pointer-events', 'none')

    
      



  // ---------- 每帧更新位置 ----------
  simulation.on('tick', () => {
    link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    node.attr('cx', d => d.x).attr('cy', d => d.y)
    label.attr('x', d => d.x).attr('y', d => d.y)
  })
}

/** 节点半径：度数越大画得越大 */
function nodeRadius(d) {
  return 6 + Math.min(d.degree || 0, 10) * 1.5
}

/** 拖拽行为 */
function dragBehavior() {
  return d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null      // 松开后恢复自由，null 表示不再固定
        d.fy = null
      })
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="graph-page">
    <header>
      <h2>知识图谱</h2>
      <input
          class="header-input"
          v-model="keyword"
          placeholder="搜索知识点"
          @keyup.enter="handleSearch"
      />
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="router.push('/chat')">问答</button>
      <button @click="router.push('/dashboard')">统计</button>
      <button class="primary-btn" @click="showCreateDialog = true">+ 新建并解析</button>
      <button @click="router.push('/notes')">笔记</button>
      <button @click="router.push('/settings')">设置</button>
      <button @click="handleLogout">退出</button>
    </header>
    <p v-if="loading" class="tip">加载中...</p>
    <p v-if="errorMsg" class="tip error">{{ errorMsg }}</p>
    <p v-if="graphNotice" class="tip info">{{ graphNotice }}</p>

    <svg ref="svgRef" class="canvas"></svg>

    <aside v-if="selectedNode" class="drawer">
      <h3>{{ selectedNode.name }}</h3>
      <span class="badge">{{ selectedNode.label }}</span>
      <p class="desc">{{ selectedNode.description || '暂无描述' }}</p>

      <h4>关联知识点</h4>
      <ul>
        <li v-for="(nb, i) in selectedNode.neighbors" :key="i">
          {{ nb.outgoing ? '→' : '←' }}
          <b>{{ nb.relation }}</b>
          {{ nb.otherName }}
        </li>
      </ul>

      <h4>出自笔记</h4>
      <ul>
        <li v-for="sn in selectedNode.sourceNotes" :key="sn.noteId">
          {{ sn.title }}
        </li>
      </ul>

      <button @click="selectedNode = null">关闭</button>
    </aside>

    <div class="legend">
      <span
          v-for="(color, label) in LABEL_COLORS"
          :key="label"
          class="legend-item"
          :class="{ off: hiddenLabels.has(label) }"
          @click="toggleLabel(label)"
      >
        <i :style="{ background: color }"></i>{{ label }}
      </span>
    </div>

    <!-- 新建笔记并解析弹窗（已从 legend 中移出，修复嵌套结构错误） -->
    <div v-if="showCreateDialog" class="mask" @click.self="showCreateDialog = false">
      <div class="dialog">
        <h3>新建笔记并解析</h3>
        <p class="hint">粘贴一段技术笔记，系统会自动抽取实体关系加入图谱</p>

        <input v-model="newNote.title" placeholder="标题，例如：Transformer 笔记" />
        <textarea
            v-model="newNote.content"
            rows="12"
            placeholder="粘贴正文，例如：Transformer 的核心是自注意力机制..."
        ></textarea>

        <div class="dialog-actions">
          <button @click="showCreateDialog = false">取消</button>
          <button class="primary" :disabled="creating" @click="createAndParse">
            {{ creating ? '解析中（约 10-30 秒）...' : '创建并解析' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-page { 
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative; 
}
header {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  background: #2c5364;
  color: #fff;
}
h2 { font-size: 18px; margin: 0; }
.user { margin-left: auto; font-size: 13px; opacity: .85; }
header button {
  padding: 6px 14px;
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255,255,255,.5);
  border-radius: 4px;
  cursor: pointer;
}
.header-input {
  width: 200px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, .35);
  border-radius: 4px;
  background: rgba(255, 255, 255, .12);
  color: #fff;
  font-size: 13px;
  outline: none;
}
.header-input::placeholder {
  color: rgba(255, 255, 255, .5);
}
.header-input:focus {
  border-color: rgba(255, 255, 255, .75);
}
.canvas { flex: 1; width: 100%; background: #fafafa; }
.legend {
  position: absolute;
  left: 16px; bottom: 16px;
  display: flex; gap: 12px;
  background: rgba(255,255,255,.92);
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 12px;
  color: #555;
  z-index: 10;
}
.legend-item {
  display: inline-flex; align-items: center; gap: 5px;
  cursor: pointer;
  user-select: none;
  padding: 2px 4px;
  border-radius: 4px;
}
.legend-item:hover { background: #f0f4f8; }
.legend-item.off { opacity: .4; text-decoration: line-through; }
.legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.tip { padding: 12px 20px; font-size: 13px; color: #666; }
.error { color: #e74c3c; }
.info { color: #8a6d3b; background: #fcf8e3; }
.drawer {
  position: absolute;
  right: 0; top: 56px; bottom: 0;
  width: 320px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  padding: 20px;
  overflow-y: auto;
  box-shadow: -2px 0 8px rgba(0,0,0,.08);
}
.drawer h3 { margin-bottom: 8px; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  background: #eef2f5;
  border-radius: 10px;
  font-size: 12px;
  color: #666;
}
.desc { margin: 12px 0 20px; font-size: 13px; line-height: 1.6; color: #555; }
.drawer h4 { font-size: 13px; color: #888; margin: 16px 0 8px; }
.drawer ul { list-style: none; font-size: 13px; }
.drawer li { padding: 5px 0; border-bottom: 1px solid #f2f2f2; }
.primary-btn {
  padding: 6px 14px;
  background: #4e79a7;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.mask {
  position: absolute; inset: 0;
  background: rgba(0, 0, 0, .4);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.dialog {
  width: 520px; background: #fff; border-radius: 10px; padding: 24px;
  display: flex; flex-direction: column; gap: 12px;
}
.dialog h3 { margin: 0; }
.hint { font-size: 12px; color: #999; margin: 0; }
.dialog input, .dialog textarea {
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
  box-sizing: border-box; font-size: 14px; font-family: inherit; resize: vertical;
}
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
.dialog-actions button {
  padding: 8px 18px; border: 1px solid #ddd; background: #fff;
  border-radius: 4px; cursor: pointer;
}
.dialog-actions button.primary { background: #4e79a7; color: #fff; border-color: #4e79a7; }
.dialog-actions button:disabled { opacity: .6; cursor: not-allowed; }
</style>
