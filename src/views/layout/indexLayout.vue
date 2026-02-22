<template>
  <div class="indexLayout-containerBox">
    <router-link to="/wordEditor" class="indexLayout-itemContainerBox">文档</router-link>
    <router-link to="/excelEditor" class="indexLayout-itemContainerBox">表格</router-link>
    <router-link to="/mindMapEditor" class="indexLayout-itemContainerBox">思维导图</router-link>
  </div>
  <div>
    <router-view></router-view>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.indexLayout-containerBox {
  width: 100%;
  height: 60px;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 20px;
  padding: 3px;
}
.indexLayout-itemContainerBox {
  padding: 10px 50px;
  color: #475b6d;
  transition: color 0.3s ease;
  text-decoration: none;
}
.indexLayout-itemContainerBox:hover,
.indexLayout-itemContainerBox.router-link-active {
  color: #409eff;
}
</style>
