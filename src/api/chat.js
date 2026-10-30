import request from './request'

/**
 * 知识图谱问答。
 * 后端会调 LLM + 查 Neo4j，一般 3~10 秒返回。
 */
export const askQuestion = (question) =>
  request.post('/chat', { question })

/** 最近的问答历史（一问一答，按时间正序） */
export const getHistory = (limit = 10) =>
  request.get('/chat/history', { params: { limit } })

/** 清空自己的问答历史 */
export const clearHistory = () =>
  request.delete('/chat/history')
