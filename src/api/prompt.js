import request from './request'

// 读取当前用户生效的抽取 Prompt（含默认值，用于对照）
export function getPrompt() {
  return request.get('/prompt/extraction')
}

// 保存自定义 Prompt
export function savePrompt(content) {
  return request.put('/prompt/extraction', { content })
}

// 恢复内置默认 Prompt
export function resetPrompt() {
  return request.delete('/prompt/extraction')
}
