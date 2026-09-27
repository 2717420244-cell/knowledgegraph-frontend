import request from './request'

/** 笔记列表（分页） */
export const listNotes = (page = 1, size = 10) =>
  request.get('/notes', { params: { page, size } })

/** 笔记详情 */
export const getNote = (id) =>
  request.get(`/notes/${id}`)

/** 新建笔记，返回 NoteVO */
export const createNote = (data) =>
  request.post('/notes', data)

/** 更新笔记（title / content 可只传一个） */
export const updateNote = (id, data) =>
  request.put(`/notes/${id}`, data)

/** 删除笔记（逻辑删除） */
export const deleteNote = (id) =>
  request.delete(`/notes/${id}`)

/** 按标题搜索 */
export const searchNotes = (keyword) =>
  request.get('/notes/search', { params: { keyword } })

/**
 * 解析笔记：调 LLM 抽取实体关系写入 Neo4j。
 * 很慢（10~30 秒），调用方必须给 loading 状态。
 */
export const parseNote = (id) =>
  request.post(`/notes/${id}/parse`)