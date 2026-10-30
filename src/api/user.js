import request from './request'

// 当前登录用户资料（不含密码）
export function getMe() {
  return request.get('/user/me')
}

// 修改邮箱 / 头像地址
export function updateProfile(email, avatarUrl) {
  return request.put('/user/profile', { email, avatarUrl })
}

// 修改密码（需验原密码）
export function changePassword(oldPassword, newPassword) {
  return request.put('/user/password', { oldPassword, newPassword })
}

// 注销账号（逻辑删除，当前 Token 下一次请求即失效）
export function deactivate() {
  return request.delete('/user/me')
}
