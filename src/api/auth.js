import request from './request'

/** 登录，返回 { token, tokenType, expiresIn, username } */
export const login = (username, password) =>
  request.post('/auth/login', { username, password })

/** 注册 */
export const register = (username, password) =>
  request.post('/auth/register', { username, password })