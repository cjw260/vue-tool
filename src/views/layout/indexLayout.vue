<template>
  <div class="app-layout">
    <!-- 极简顶部导航栏 -->
    <header class="app-header">
      <div class="logo">
        <span class="icon">📊</span>
        <span class="title">在线表格工作台</span>
      </div>
      <!-- 如果未来需要添加诸如“导出”、“保存”等全局按钮，可以放在这里 -->
      <div class="header-actions">
        <!-- <button class="action-btn">导出</button> -->
      </div>
    </header>

    <!-- 核心工作区：这里将撑满剩余屏幕，用于渲染 Excel 组件 -->
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <!-- 使用 keep-alive 保证表格状态在路由稍微切换时不丢失（可选） -->
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
// 这里已经完全清理了之前切换 Word、MindMap 的状态和路由逻辑
// 目前布局只作为一个纯粹的外壳存在
</script>

<style scoped>
/* 基础重置与全屏布局 */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden; /* 防止外层出现滚动条，让表格组件自己控制滚动 */
  background-color: #f4f5f8;
}

/* 顶部导航样式 */
.app-header {
  height: 50px;
  background-color: #ffffff;
  border-bottom: 1px solid #e0e2e4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-sizing: border-box;
  z-index: 10;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.logo .icon {
  font-size: 20px;
}

.logo .title {
  font-size: 16px;
  font-weight: 600;
  color: #333333;
  letter-spacing: 0.5px;
}

/* 预留的操作按钮区域样式 */
.header-actions {
  display: flex;
  gap: 12px;
}

/* 核心内容区样式 */
.app-main {
  flex: 1;
  position: relative;
  width: 100%;
  height: calc(100vh - 50px); /* 减去顶部导航的高度 */
  overflow: hidden;
}
</style>
