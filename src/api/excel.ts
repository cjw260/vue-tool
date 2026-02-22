import request from '@/utils/request'

//定义接口返回的数据类型
export interface RemoteTableItem {
  id: number
  name: string
  updatedAt: number
}

// [新增] 获取云端表格列表
export function getTableList() {
  return request<unknown, RemoteTableItem[]>({
    url: '/table/list',
    method: 'get',
  })
}

// 获取云端表格详情
// 修正：后端路由是 /table/detail/:id
export const getRemoteTableDetail = (id: number) => {
  return request<unknown, unknown>({
    url: `/table/detail/${id}`,
    method: 'get',
  })
}

// 保存表格到云端
// content可选，如果只改名可以不传content
export function saveRemoteTable(data: { id: number; name: string; content?: unknown }) {
  return request<unknown, { id: number; updatedAt: number }>({
    url: '/table/save',
    method: 'post',
    data,
  })
}

// 删除云端表格
export function deleteRemoteTable(id: number) {
  return request<unknown, void>({
    url: '/table/delete',
    method: 'post',
    data: { id },
  })
}

// 获取云端指定表格全部信息（通常用于校验或获取元数据）
// 修正：后端路由是 /table/detail/:id
export function getRemoteTableInfo(id: number) {
  return request<unknown, RemoteTableItem>({
    url: `/table/detail/${id}`,
    method: 'get',
  })
}

// 检验列表有效性
export function validateRemoteTableList(list: RemoteTableItem[]) {
  return request<unknown, RemoteTableItem[]>({
    url: '/table/validate',
    method: 'post',
    data: list,
  })
}
