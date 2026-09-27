import request from './request'

/**
 * 知识图谱问答。
 * 后端会调 LLM + 查 Neo4j，一般 3~10 秒返回。
 */
export const askQuestion = (question) =>
  request.post('/chat', { question })