import request from './request'

/** 全图概览 */
export const getOverview = (limit = 200) =>
  request.get('/graph/overview', { params: { limit } })

/** N 跳子图 */
export const getSubgraph = (name, depth = 2) =>
  request.get('/graph/subgraph', { params: { name, depth } })

/** 节点详情 */
export const getNodeDetail = (name) =>
  request.get('/graph/node', { params: { name } })

/** 关键词搜索节点 */
export const searchNodes = (keyword, limit = 20) =>
  request.get('/graph/search', { params: { keyword, limit } })

/** 图谱统计 */
export const getStats = () =>
  request.get('/graph/stats')