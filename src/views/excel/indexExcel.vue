<template>
  <!--
    右键菜单组件 (绝对定位)
    根据 menuVisible 控制显示，position.x 和 position.y 控制出现的位置
  -->
  <div
    v-if="menuVisible"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    class="indexExcel-menuContainerBox"
  >
    <div @click.stop="handleRenameTable" class="indexExcel-menuContainerBoxItem">重命名</div>
    <div @click.stop="handleRemoveFromList" class="indexExcel-menuContainerBoxItem">从列表移除</div>
    <div
      @click.stop="handleDeleteTable"
      class="indexExcel-menuContainerBoxItem"
      style="color: #f56c6c"
    >
      彻底删除(服务器)
    </div>
  </div>

  <!-- 分享弹窗：显示当前表格ID，供用户复制发送给协作者 -->
  <div v-if="shareBoxVisible" class="shareBoxOverlay">
    <div class="shareBoxContainer">
      <div class="shareBoxHeader">协同分享</div>
      <div class="shareBoxContent">
        <div class="shareBoxItem">
          <span class="label">表格 ID：</span>
          <div class="value-box">{{ activeId || '无' }}</div>
        </div>
        <div class="shareBoxTip">将此 ID 发送给同事，他们输入ID即可加入协同。</div>
      </div>
      <div class="shareBoxFooter">
        <button class="btn btn-default" @click="shareBoxVisible = false">关闭</button>
        <button class="btn btn-primary" @click="handleCopyShareInfo">复制 ID</button>
      </div>
    </div>
  </div>

  <!-- 加入他人表格弹窗：供用户输入别人分享的ID，加入协同 -->
  <div v-if="addOtherBoxVisible" class="shareBoxOverlay">
    <div class="shareBoxContainer">
      <div class="shareBoxHeader">加入协同表格</div>
      <div class="shareBoxContent">
        <div class="shareBoxItem" style="margin-bottom: 5px">
          <span class="label">表格 ID：</span>
          <!-- 按下回车键也可触发加入逻辑 -->
          <input
            v-model="otherTableId"
            class="input-box"
            placeholder="请输入对方分享的ID"
            @keyup.enter="confirmAddOtherTable"
          />
        </div>
      </div>
      <div class="shareBoxFooter">
        <button class="btn btn-default" @click="addOtherBoxVisible = false">取消</button>
        <button class="btn btn-primary" @click="confirmAddOtherTable">加入</button>
      </div>
    </div>
  </div>

  <!-- Element Plus 提供的可拖拽分割面板，用于左右分栏布局 -->
  <el-splitter lazy class="indexExcel-containerBox">
    <!-- 左侧侧边栏：我的表格列表 -->
    <el-splitter-panel v-model:size="leftSize" :min="leftMinSize" :max="800">
      <div class="demo-panel indexExcel-leftContainer">
        <!-- 控制左侧边栏展开/收起的按钮 -->
        <div @click="handleLeftDisplayChange" class="indexExcel-leftContainer-img">
          <img
            v-if="leftIsDisplay"
            style="width: 16px; height: 16px"
            src="@/asset/close.svg"
            alt="收起"
          /><img v-else style="width: 16px; height: 16px" src="@/asset/open.svg" alt="展开" />
        </div>

        <!-- 侧边栏头部：标题及快捷操作按钮（添加、分享） -->
        <div v-show="leftIsDisplay" class="indexExcel-leftContainer-myTableListHeader">
          <div class="indexExcel-leftContainer-myTableListHeader-title">我的协同表格</div>
          <div class="indexExcel-leftContainer-myTableListHeader-addBtnContainer">
            <div style="cursor: pointer;" @click="handleAddTable" class="indexExcel-leftContainer-myTableListHeader-addBtn">
              <img style="width: 16px; height: 16px" src="@/asset/add.svg" />
            </div>
            <div style="cursor: pointer;" @click="openShareBox" class="indexExcel-leftContainer-myTableListHeader-addBtn">
              <img style="width: 16px; height: 16px" src="@/asset/share.svg" />
            </div>
          </div>
        </div>

        <!-- 表格列表区域 -->
        <div v-show="listIsDisplay" class="indexExcel-leftContainer-myTableListContainer">
          <template v-if="tableList.length != 0">
            <!-- 渲染表格列表，绑定了右键菜单事件和左键点击选中事件 -->
            <div
              v-for="item in tableList"
              @contextmenu.prevent="openMenu($event, item.id)"
              @click="handleSelectTable(item.id)"
              :key="item.id"
              class="indexExcel-leftContainer-btnContainer"
              :class="{ active: activeId === item.id }"
            >
              <span style="margin-left: 6px">{{ item.name }}</span>
            </div>
          </template>
          <!-- 空状态提示 -->
          <div v-else class="empty-list-tip">
            暂无表格<br />
            点击右上角 + 创建<br />
            或点击下方加入他人表格
          </div>

          <!-- 底部“加入他人表格”常驻按钮 -->
          <div class="add-other-table-btn" @click="handleAddOtherTable">
            <img style="width: 14px; height: 14px; margin-right: 5px" src="@/asset/add.svg" />
            加入其他人的表格
          </div>
        </div>
      </div>
    </el-splitter-panel>

    <!-- 右侧主工作区：Excel 编辑器 -->
    <el-splitter-panel :min="200">
      <!-- 未选中表格时的空状态 -->
      <div v-if="!activeId" class="indexExcel-rightContainer">
        <div class="indexExcel-rightContainerNoneContainer">请选择或创建一个表格开始协同</div>
      </div>
      <!-- 选中表格后渲染 excelItem 组件，用 :key 强制组件在切换表格时重新挂载 -->
      <div v-else class="indexExcel-rightContainer-editorContainer">
        <excelItem :key="activeId" :id="activeId"></excelItem>
      </div>
    </el-splitter-panel>
  </el-splitter>
</template>

<script setup lang="ts">
import {
  saveRemoteTable,
  deleteRemoteTable,
  validateRemoteTableList,
  getRemoteTableDetail,
  type RemoteTableItem,
} from '@/api/excel'
import excelItem from './components/excelItem.vue'
import { onMounted, onUnmounted, reactive, ref } from 'vue'

// ==========================================
// 核心状态数据定义
// ==========================================

// 用于将用户拥有的/加入的表格ID保存在浏览器本地，实现"历史记录"功能
const LOCAL_STORAGE_KEY = 'my_collaborative_excel_ids'

// 侧边栏 UI 状态
const leftIsDisplay = ref<boolean>(true) // 侧边栏头部是否显示
const listIsDisplay = ref<boolean>(true) // 表格列表是否显示
const leftSize = ref<number>(315) // 左侧面板当前宽度
const leftMinSize = ref<number>(250) // 左侧面板最小宽度

// 数据状态
const tableList = ref<Array<RemoteTableItem>>([]) // 经过后端校验后的表格详情列表
const activeId = ref<number | null>(null) // 当前正在编辑的表格ID

// 弹窗与菜单 UI 状态
const menuVisible = ref(false) // 右键菜单是否可见
const shareBoxVisible = ref(false) // 分享弹窗是否可见
const addOtherBoxVisible = ref(false) // 加入他人表格弹窗是否可见
const otherTableId = ref('') // 用户在输入框中填写的他人表格ID

// 右键菜单相关状态
const position = reactive({ x: 0, y: 0 }) // 右键菜单显示的坐标位置
const delId = ref<number | null>(null) // 右键点击时选中的那张表格的ID，用于重命名、删除等操作


// ==========================================
// 逻辑处理函数
// ==========================================

/**
 * 从本地存储中读取用户的表格历史记录ID列表
 */
const getLocalIds = (): number[] => {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY)
    return json ? JSON.parse(json) : []
  } catch (e) {
    console.error('读取本地ID失败:', e)
    return []
  }
}

/**
 * 将新的表格ID列表保存到本地存储，并去重
 */
const saveLocalIds = (ids: number[]) => {
  const uniqueIds = Array.from(new Set(ids)) // Set自带去重功能
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(uniqueIds))
}

/**
 * 刷新表格列表
 * 逻辑：读取本地所有ID -> 发给后端请求校验(有些可能在服务器已被删除) -> 拿到真实有效的数据更新视图
 */
const refreshList = async () => {
  const localIds = getLocalIds()
  if (localIds.length === 0) {
    tableList.value = []
    return
  }

  try {
    // 构造 payload，as unknown 作为类型转换跳板绕过严格类型检查
    const payload = localIds.map((id) => ({ id })) as unknown as RemoteTableItem[]
    // 调用接口：获取这些ID对应的实际表格信息（无效ID会被后端过滤）
    const validTables = await validateRemoteTableList(payload)

    tableList.value = validTables || []

    // 同步本地存储：如果发现有本地ID在服务端不存在了，需要更新本地存储，剔除无效ID
    const validIds = validTables.map((t) => t.id)
    if (validIds.length !== localIds.length) {
      saveLocalIds(validIds)
    }
  } catch (error) {
    console.error('刷新列表失败', error)
  }
}

/**
 * 新建一个协同表格
 */
const handleAddTable = async () => {
  const newId = new Date().getTime() // 简单使用时间戳生成唯一ID
  const newName = `协同表格 ${new Date().toLocaleTimeString()}` // 默认名称

  try {
    // 1. 在服务端创建记录
    await saveRemoteTable({ id: newId, name: newName })
    // 2. 将新ID插入到本地记录的最前面
    const ids = getLocalIds()
    ids.unshift(newId)
    saveLocalIds(ids)
    // 3. 刷新列表并自动选中新建的表格
    await refreshList()
    activeId.value = newId
  } catch (err) {
    console.error('创建表格失败:', err)
    alert('创建失败，请检查网络')
  }
}

/**
 * 打开加入他人表格的弹窗
 */
const handleAddOtherTable = () => {
  otherTableId.value = '' // 清空上次遗留的输入框内容
  addOtherBoxVisible.value = true
}

/**
 * 确认加入他人表格逻辑
 */
const confirmAddOtherTable = async () => {
  const inputId = Number(otherTableId.value.trim())
  if (!inputId) {
    alert('请输入表格ID')
    return
  }

  // 防止重复加入
  if (tableList.value.some((t) => t.id === inputId)) {
    alert('该表格已在列表中')
    activeId.value = inputId
    addOtherBoxVisible.value = false
    return
  }

  try {
    // 1. 调用接口检查这个表格ID在服务器上是否存在
    await getRemoteTableDetail(inputId)
    // 2. 存在则加入本地历史记录
    const ids = getLocalIds()
    ids.unshift(inputId)
    saveLocalIds(ids)
    // 3. 刷新列表并选中
    await refreshList()
    activeId.value = inputId
    addOtherBoxVisible.value = false
  } catch (err) {
    console.error('加入表格失败:', err)
    alert('无法找到该表格或网络错误')
  }
}

/**
 * 右键菜单操作：重命名表格
 */
const handleRenameTable = async () => {
  if (delId.value === null) return

  const targetTable = tableList.value.find((t) => t.id === delId.value)
  if (!targetTable) return

  // 简单使用 prompt 弹窗获取新名字
  const newName = prompt('请输入新的表格名称', targetTable.name)
  if (newName && newName.trim() !== '' && newName !== targetTable.name) {
    try {
      // 提交重命名请求到服务器
      await saveRemoteTable({ id: delId.value, name: newName })
      await refreshList() // 刷新列表查看最新名称
    } catch (err) {
      console.error('重命名失败:', err)
      alert('重命名失败')
    }
  }
  menuVisible.value = false // 操作后隐藏右键菜单
}

/**
 * 右键菜单操作：仅从本地列表移除 (不影响服务器和其他协同者)
 */
const handleRemoveFromList = async () => {
  if (delId.value !== null) {
    // 从本地存储中剔除该ID
    const ids = getLocalIds()
    const newIds = ids.filter((id) => id !== delId.value)
    saveLocalIds(newIds)

    await refreshList()
    // 如果移除的是当前正在编辑的表格，清空右侧编辑区
    if (activeId.value === delId.value) {
      activeId.value = null
    }
    menuVisible.value = false
  }
}

/**
 * 右键菜单操作：彻底从服务器删除该表格 (所有人都将无法访问)
 */
const handleDeleteTable = async () => {
  if (delId.value !== null) {
    if (
      confirm(
        '【危险】确定要从服务器彻底删除此表格吗？\n如果只是不想看到它，请选择“从列表移除”。\n删除后所有人都无法访问！',
      )
    ) {
      try {
        // 请求服务器删除
        await deleteRemoteTable(delId.value)

        // 同时从本地历史中清理
        const ids = getLocalIds()
        const newIds = ids.filter((id) => id !== delId.value)
        saveLocalIds(newIds)

        await refreshList()
        // 如果删除的是当前活动表格，重置状态
        if (activeId.value === delId.value) {
          activeId.value = null
        }
      } catch (err) {
        console.error('删除失败:', err)
        alert('删除失败')
      }
    }
    menuVisible.value = false
  }
}

/**
 * 鼠标左键点击列表：切换要编辑的表格
 */
const handleSelectTable = (id: number) => {
  if (activeId.value === id) return
  activeId.value = id
}

/**
 * 打开分享弹窗
 */
const openShareBox = () => {
  if (activeId.value) shareBoxVisible.value = true
}

/**
 * 复制当前活动表格的 ID 到系统剪贴板
 */
const handleCopyShareInfo = () => {
  if (!activeId.value) return
  navigator.clipboard
    .writeText(String(activeId.value))
    .then(() => (shareBoxVisible.value = false)) // 复制成功后自动关闭弹窗
    .catch(() => alert('复制失败'))
}

/**
 * 在列表上触发鼠标右键事件：打开自定义右键菜单
 */
const openMenu = (event: MouseEvent, id: number) => {
  // 获取鼠标点击的位置来定位菜单
  position.x = event.clientX
  position.y = event.clientY
  menuVisible.value = true
  delId.value = id // 记录下操作的对象是谁
}

/**
 * 侧边栏折叠/展开动画状态控制
 */
const handleLeftDisplayChange = () => {
  leftIsDisplay.value = !leftIsDisplay.value
  listIsDisplay.value = !listIsDisplay.value
  leftSize.value = leftIsDisplay.value ? 350 : 70
  leftMinSize.value = leftIsDisplay.value ? 250 : 70
}

// ==========================================
// 生命周期钩子
// ==========================================

onMounted(async () => {
  // 全局点击事件：用于点击空白处隐藏自定义右键菜单
  window.addEventListener('click', () => {
    menuVisible.value = false
  })
  // 组件挂载时自动拉取并刷新最新列表数据
  await refreshList()
})

onUnmounted(() => {
  // 组件销毁时移除全局事件监听，防止内存泄漏
  window.removeEventListener('click', () => {
    menuVisible.value = false
  })
})
</script>

<style scoped>
/* 保持原有样式，防止文本被意外选中 */
* {
  user-select: none;
}
.indexExcel-containerBox {
  height: calc(100vh - 60px);
  z-index: 1000;
}
.indexExcel-leftContainer {
  background-color: #f5f6f7;
  height: 100%;
  padding: 20px 5px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.indexExcel-leftContainer-img {
  width: 30px;
  height: 30px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 10px;
}
.indexExcel-leftContainer-img:hover {
  background-color: #e1e2e3;
}
.indexExcel-leftContainer-btnContainer {
  padding: 8px 30px;
  cursor: pointer;
  border-radius: 6px;
  color: #475b6d;
  display: flex;
  align-items: center;
}
.indexExcel-leftContainer-btnContainer:hover {
  background-color: #e1e2e3;
}
.indexExcel-leftContainer-btnContainer.active {
  background-color: #d3def6;
  color: #1a73e8 !important;
}
.indexExcel-leftContainer-myTableListHeader {
  display: flex;
  justify-content: space-between;
  padding: 5px 30px;
  border-radius: 6px;
  align-items: center;
}
.indexExcel-leftContainer-myTableListHeader-title {
  font-weight: 600;
  color: #333;
}
.indexExcel-leftContainer-myTableListContainer {
  flex: 1;
  overflow-y: auto;
  margin-top: 10px;
  scrollbar-width: thin;
}
.indexExcel-rightContainer {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.indexExcel-rightContainer-editorContainer {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.indexExcel-menuContainerBox {
  position: fixed;
  width: 140px; /* 稍微加宽以适应文字 */
  background-color: white;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  z-index: 2000;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
.indexExcel-menuContainerBoxItem {
  padding: 10px 15px;
  cursor: pointer;
  font-size: 13px;
  color: #606266;
}
.indexExcel-menuContainerBoxItem:hover {
  background-color: #ecf5ff;
  color: #409eff;
}

/* Share Box Styles (弹窗样式) */
.shareBoxOverlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
}
.shareBoxContainer {
  width: 420px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.shareBoxHeader {
  padding: 16px 20px;
  font-size: 18px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #eee;
}
.shareBoxContent {
  padding: 24px 20px;
  color: #555;
  font-size: 14px;
}
.shareBoxItem {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}
.shareBoxItem .label {
  width: 80px;
  font-weight: 500;
  color: #666;
}
.shareBoxItem .value-box {
  background-color: #f5f7fa;
  padding: 6px 10px;
  border-radius: 4px;
  color: #333;
  font-family: monospace;
  border: 1px solid #e4e7ed;
  flex: 1;
}
.shareBoxTip {
  margin-top: 10px;
  font-size: 12px;
  color: #999;
}
.shareBoxFooter {
  padding: 16px 20px;
  background-color: #f9fafb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #eee;
}
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: none;
}
.btn-default {
  background-color: #e4e7ed;
  color: #606266;
}
.btn-primary {
  background-color: #1a73e8;
  color: white;
}
.add-other-table-btn {
  margin-top: auto;
  margin-bottom: 10px;
  padding: 12px 30px;
  color: #1a73e8;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 13px;
}
.add-other-table-btn:hover {
  text-decoration: underline;
}
.input-box {
  flex: 1;
  padding: 8px 10px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  outline: none;
  font-size: 14px;
  font-family: monospace;
}
.empty-list-tip {
  padding: 40px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}
.indexExcel-leftContainer-myTableListHeader-addBtnContainer{
  display: flex;
  gap: 10px;
}

.indexExcel-leftContainer-myTableListHeader-addBtn :hover {
  background-color: #e1e2e3;
  border-radius: 6px;
}
</style>
