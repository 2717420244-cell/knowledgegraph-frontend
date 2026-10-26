<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { getStats } from '@/api/graph'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const errorMsg = ref('')
const stats = ref(null)

// 四个图表实例
let labelChart = null
let relationChart = null
let topNodeChart = null

// 图例颜色（与 GraphView 保持一致）
const LABEL_COLORS = {
  Concept: '#4e79a7',
  Document: '#f28e2b',
  Person: '#e15759',
  Event: '#76b7b2'
}
const FALLBACK_COLOR = '#999'

onMounted(() => loadStats())

onUnmounted(() => {
  // 销毁 echarts 实例，防止内存泄漏
  labelChart?.dispose()
  relationChart?.dispose()
  topNodeChart?.dispose()
})

async function loadStats() {
  loading.value = true
  errorMsg.value = ''
  try {
    stats.value = await getStats()
    await nextTickRender()
  } catch (e) {
    errorMsg.value = e.message || '加载统计失败'
  } finally {
    loading.value = false
  }
}

async function nextTickRender() {
  await nextTickImpl()
  renderCharts()
}

// 轻量 nextTick（避免额外 import 顺序问题）
async function nextTickImpl() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function renderCharts() {
  if (!stats.value) return

  renderLabelPie()
  renderRelationBar()
  renderTopNodesBar()
}

/** 实体类型饼图 */
function renderLabelPie() {
  const el = document.querySelector('.chart-label')
  if (!el) return
  labelChart = echarts.init(el)
  const data = (stats.value.labelStats || []).map(item => ({
    name: item.label,
    value: item.count,
    itemStyle: { color: LABEL_COLORS[item.label] || FALLBACK_COLOR }
  }))
  labelChart.setOption({
    title: { text: '实体类型分布', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '55%'],
      data,
      label: { formatter: '{b}\n{c}' },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' }
      }
    }]
  })
}

/** 关系类型柱状图 */
function renderRelationBar() {
  const el = document.querySelector('.chart-relation')
  if (!el) return
  relationChart = echarts.init(el)
  const relations = (stats.value.relationStats || []).map(i => i.relation)
  const counts = (stats.value.relationStats || []).map(i => i.count)
  relationChart.setOption({
    title: { text: '关系类型分布', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 30, bottom: 40, top: 50 },
    xAxis: {
      type: 'category',
      data: relations,
      axisLabel: { rotate: 20 }
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#4e79a7' },
      label: { show: true, position: 'top' }
    }]
  })
}

/** 度数 TOP10 条形图 */
function renderTopNodesBar() {
  const el = document.querySelector('.chart-topnodes')
  if (!el) return
  topNodeChart = echarts.init(el)
  // 倒序放 y 轴，度数最大的排最上面
  const nodes = [...(stats.value.topNodes || [])].reverse()
  const names = nodes.map(n => n.name)
  const degrees = nodes.map(n => n.degree)
  topNodeChart.setOption({
    title: { text: '节点度数 TOP10（最核心的知识点）', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const p = params[0]
        const node = nodes[p.dataIndex]
        return `${p.name}<br/>类型：${node.label}<br/>度数：${p.value}`
      }
    },
    grid: { left: 100, right: 40, bottom: 30, top: 50 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: names },
    series: [{
      type: 'bar',
      data: degrees,
      itemStyle: {
        color: params => {
          const node = nodes[params.dataIndex]
          return LABEL_COLORS[node.label] || FALLBACK_COLOR
        }
      },
      label: { show: true, position: 'right' }
    }]
  })
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

/** 重新加载 */
function refresh() {
  loadStats()
}
</script>

<template>
  <div class="dashboard-page">
    <header>
      <h2>统计面板</h2>
      <span class="user">欢迎，{{ authStore.username }}</span>
      <button @click="router.push('/graph')">图谱</button>
      <button @click="router.push('/notes')">笔记</button>
      <button @click="router.push('/chat')">问答</button>
      <button class="primary-btn" @click="refresh" :disabled="loading">刷新</button>
      <button @click="handleLogout">退出</button>
    </header>

    <p v-if="loading" class="tip">加载中...</p>
    <p v-if="errorMsg" class="tip error">{{ errorMsg }}</p>

    <template v-if="stats">
      <!-- 规模数字卡片 -->
      <div class="cards">
        <div class="card">
          <div class="num">{{ stats.nodeCount }}</div>
          <div class="name">知识点总数</div>
        </div>
        <div class="card">
          <div class="num">{{ stats.relationCount }}</div>
          <div class="name">关系总数</div>
        </div>
        <div class="card isolated">
          <div class="num">{{ stats.isolatedNodeCount }}</div>
          <div class="name">孤立节点数</div>
          <div class="hint">孤立节点 = 知识断层，建议补笔记把它们连起来</div>
        </div>
        <div class="card">
          <div class="num">{{ stats.topNodes?.length ? stats.topNodes[0].degree : 0 }}</div>
          <div class="name">最高节点度数</div>
        </div>
      </div>

      <!-- 图表区 -->
      <div class="charts">
        <div class="chart-box">
          <div class="chart chart-label"></div>
        </div>
        <div class="chart-box">
          <div class="chart chart-relation"></div>
        </div>
        <div class="chart-box wide">
          <div class="chart chart-topnodes"></div>
        </div>
      </div>
    </template>

    <p v-else-if="!loading && !errorMsg" class="tip">暂无数据</p>
  </div>
</template>

<style scoped>
.dashboard-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #fafafa;
}
header {
  height: 56px;
  flex-shresh: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
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
header button.primary-btn { background: #4e79a7; border-color: #4e79a7; }
header button:disabled { opacity: .6; cursor: not-allowed; }

.tip { padding: 12px 20px; font-size: 13px; color: #666; }
.error { color: #e74c3c; }

.cards {
  display: flex;
  gap: 16px;
  padding: 20px 20px 0;
}
.card {
  flex: 1;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 16px 20px;
  text-align: center;
}
.card .num { font-size: 32px; font-weight: 700; color: #2c5364; }
.card .name { font-size: 13px; color: #888; margin-top: 4px; }
.card.isolated { border-color: #f0b27a; background: #fdf6ec; }
.card.isolated .num { color: #ca7728; }
.card .hint { font-size: 11px; color: #b58850; margin-top: 6px; }

.charts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px 20px;
}
.chart-box {
  width: calc(50% - 8px);
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;
}
.chart-box.wide { width: 100%; }
.chart { width: 100%; height: 320px; }
</style>
