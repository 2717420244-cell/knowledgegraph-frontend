<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { getOverview, getSubgraph, getNodeDetail, searchNodes } from '@/api/graph'

const router = useRouter()
const authStore = useAuthStore()

const svgRef = ref(null)
const loading = ref(false)
const errorMsg = ref('')
const selectedNode = ref(null)

async function selectNode(d) {
  try {
    selectedNode.value = await getNodeDetail(d.name)
  } catch (e) {
    selectedNode.value = null
  }
}

let simulation = null

// 不同标签用不同颜色
const LABEL_COLORS = {
  Concept: '#4e79a7',
  Document: '#f28e2b',
  Person: '#e15759',
  Event: '#76b7b2'
}

function colorOf(label) {
  return LABEL_COLORS[label] || '#999'
}

onMounted(async () => {
  await loadOverview()
})

onUnmounted(() => {
  // 组件销毁时必须停掉仿真，否则它会在后台一直算，内存泄漏
  simulation?.stop()
})

async function loadOverview() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getOverview(200)
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
      .on('click', (event, d) => {
        selectNode(d)
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
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="handleLogout">退出</button>
    </header>

    <p v-if="loading" class="tip">加载中...</p>
    <p v-if="errorMsg" class="tip error">{{ errorMsg }}</p>

    <svg ref="svgRef" class="canvas">
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
    </svg>
  </div>
</template>

<style scoped>
.graph-page { width: 100%; height: 100%; display: flex; flex-direction: column; }
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
.canvas { flex: 1; width: 100%; background: #fafafa; }
.tip { padding: 12px 20px; font-size: 13px; color: #666; }
.error { color: #e74c3c; }
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
</style>