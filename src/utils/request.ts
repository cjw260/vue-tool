import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type AxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'

// 1. 将泛型默认值改为 unknown，比 any 更安全
interface ApiResponse<T = unknown> {
  code: number
  data: T
  msg: string
}

const service: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8',
  },
})

// 2. 请求拦截器：使用 InternalAxiosRequestConfig 类型
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 可以在这里添加 token 逻辑
    // const token = localStorage.getItem('token')
    // if (token) {
    //   config.headers['Authorization'] = 'Bearer ' + token
    // }
    return config
  },
  (error: unknown) => {
    console.error('Request Error:', error)
    return Promise.reject(error)
  },
)

// 3. 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data

    if (res.code === 200) {
      // ⚠️ 注意：这里我们将 res.data (类型为 T) 直接返回了
      // 但 Axios 的类型定义期望拦截器返回 AxiosResponse
      // 所以这里使用 'as unknown as AxiosResponse' 来通过 TS 检查，同时保留运行时逻辑
      return res.data as unknown as AxiosResponse
    } else {
      ElMessage.error(res.msg || '系统错误')
      return Promise.reject(new Error(res.msg || 'Error'))
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (error: any) => {
    // 这里的 error 通常是 any，因为网络错误的结构不固定
    console.error('Response Error:', error)
    let message = '网络连接失败'
    // 安全访问 error 属性
    if (error?.message?.includes('timeout')) message = '请求超时'
    else if (error?.response?.status === 404) message = '接口不存在'
    else if (error?.response?.status === 500) message = '服务器内部错误'

    ElMessage.error(message)
    return Promise.reject(error)
  },
)

/**
 * 封装一个通用的 request 函数
 * 这样在 API 文件中就可以使用 request<MyDataType>({...}) 来获得正确的类型提示
 */
export const request = <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  return service.request<unknown, T>(config)
}

export default service
