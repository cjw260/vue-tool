import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Layout',
      component: () => import('../views/layout/indexLayout.vue'),
      redirect: '/wordEditor',
      children: [
        {
          path: '/wordEditor',
          name: 'wordEditor',
          component: () => import('../views/word/indexWord.vue'),
        },
        {
          path: '/excelEditor',
          name: 'excelEditor',
          component: () => import('../views/excel/indexExcel.vue'),
        },
        {
          path: '/mindMapEditor',
          name: 'mindMapEditor',
          component: () => import('../views/mindMap/indexMindMao.vue'),
        },
      ],
    },
  ],
})

export default router
