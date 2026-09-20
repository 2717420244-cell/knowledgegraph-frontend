import axios from 'axios'

const request = axios.create({
  baseURL: '/api',      // 走 Vite 代理，不用写死 8080
  timeout: 60000        // LLM 解析比较慢，超时给足
})

// 请求拦截器：自动带上 Token
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一拆壳 + 处理未登录
request.interceptors.response.use(
  response => {
    const res = response.data
    // 后端统一返回 { code, msg, data }，这里直接把 data 交出去
    if (res.code === 200) {
      return res.data
    }
    // 业务异常（比如 404 笔记不存在、403 无权限）
    return Promise.reject(new Error(res.msg || '请求失败'))
  },
  error => {
    // 注意：你后端没配 authenticationEntryPoint，
    // 未认证返回的是 403 而不是 401，所以这里两个都要判断
    const status = error.response?.status
    if (status === 401 || status === 403) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default request