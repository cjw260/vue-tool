import { createRouter, createWebHistory } from 'vue-router'
// 引入布局组件
import Layout from '@/views/layout/indexLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Layout',
      component: Layout,
      redirect: '/excel', // 将默认访问路径直接重定向到 excel
      children: [
        {
          path: 'excel',
          name: 'Excel',
          component: () => import('@/views/excel/indexExcel.vue'),
          meta: {
            title: '在线表格'
          }
        }
        // 👇 在这里将原来关于 word 和 mindMap 的路由对象全部删除
      ]
    }
  ]
})

export default router
