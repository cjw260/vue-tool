<template>
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

  <!-- 分享弹窗 -->
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

  <!-- 加入他人表格弹窗 -->
  <div v-if="addOtherBoxVisible" class="shareBoxOverlay">
    <div class="shareBoxContainer">
      <div class="shareBoxHeader">加入协同表格</div>
      <div class="shareBoxContent">
        <div class="shareBoxItem" style="margin-bottom: 5px">
          <span class="label">表格 ID：</span>
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

  <el-splitter lazy class="indexExcel-containerBox">
    <el-splitter-panel v-model:size="leftSize" :min="leftMinSize" :max="800">
      <div class="demo-panel indexExcel-leftContainer">
        <div @click="handleLeftDisplayChange" class="indexExcel-leftContainer-img">
          <img
            v-if="leftIsDisplay"
            style="width: 16px; height: 16px"
            src="@/asset/close.svg"
            alt="收起"
          /><img v-else style="width: 16px; height: 16px" src="@/asset/open.svg" alt="展开" />
        </div>

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

        <div v-show="listIsDisplay" class="indexExcel-leftContainer-myTableListContainer">
          <template v-if="tableList.length != 0">
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
          <div v-else class="empty-list-tip">
            暂无表格<br />
            点击右上角 + 创建<br />
            或点击下方加入他人表格
          </div>

          <div class="add-other-table-btn" @click="handleAddOtherTable">
            <img style="width: 14px; height: 14px; margin-right: 5px" src="@/asset/add.svg" />
            加入其他人的表格
          </div>
        </div>
      </div>
    </el-splitter-panel>

    <el-splitter-panel :min="200">
      <div v-if="!activeId" class="indexExcel-rightContainer">
        <div class="indexExcel-rightContainerNoneContainer">请选择或创建一个表格开始协同</div>
      </div>
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

const LOCAL_STORAGE_KEY = 'my_collaborative_excel_ids'

// 状态定义
const leftIsDisplay = ref<boolean>(true)
const listIsDisplay = ref<boolean>(true)
const leftSize = ref<number>(315)
const leftMinSize = ref<number>(250)

const tableList = ref<Array<RemoteTableItem>>([])
const activeId = ref<number | null>(null)

const menuVisible = ref(false)
const shareBoxVisible = ref(false)
const addOtherBoxVisible = ref(false)
const otherTableId = ref('')

const position = reactive({ x: 0, y: 0 })
const delId = ref<number | null>(null)

// ----------------------------------------------------------------
// 逻辑函数
// ----------------------------------------------------------------

const getLocalIds = (): number[] => {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY)
    return json ? JSON.parse(json) : []
  } catch (e) {
    console.error('读取本地ID失败:', e)
    return []
  }
}

const saveLocalIds = (ids: number[]) => {
  const uniqueIds = Array.from(new Set(ids))
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(uniqueIds))
}

const refreshList = async () => {
  const localIds = getLocalIds()
  if (localIds.length === 0) {
    tableList.value = []
    return
  }

  try {
    // as any 规避类型检查，只传 id 数组给后端校验
    const payload = localIds.map((id) => ({ id })) as unknown as RemoteTableItem[]
    const validTables = await validateRemoteTableList(payload)

    tableList.value = validTables || []

    const validIds = validTables.map((t) => t.id)
    if (validIds.length !== localIds.length) {
      saveLocalIds(validIds)
    }
  } catch (error) {
    console.error('刷新列表失败', error)
  }
}

const handleAddTable = async () => {
  const newId = new Date().getTime()
  const newName = `协同表格 ${new Date().toLocaleTimeString()}`

  try {
    await saveRemoteTable({ id: newId, name: newName })
    const ids = getLocalIds()
    ids.unshift(newId)
    saveLocalIds(ids)
    await refreshList()
    activeId.value = newId
  } catch (err) {
    console.error('创建表格失败:', err)
    alert('创建失败，请检查网络')
  }
}

// --- 修复：添加了这个漏掉的函数 ---
const handleAddOtherTable = () => {
  otherTableId.value = '' // 清空输入框
  addOtherBoxVisible.value = true
}

const confirmAddOtherTable = async () => {
  const inputId = Number(otherTableId.value.trim())
  if (!inputId) {
    alert('请输入表格ID')
    return
  }

  if (tableList.value.some((t) => t.id === inputId)) {
    alert('该表格已在列表中')
    activeId.value = inputId
    addOtherBoxVisible.value = false
    return
  }

  try {
    await getRemoteTableDetail(inputId) // 校验ID是否存在
    const ids = getLocalIds()
    ids.unshift(inputId)
    saveLocalIds(ids)

    await refreshList()
    activeId.value = inputId
    addOtherBoxVisible.value = false
  } catch (err) {
    console.error('加入表格失败:', err)
    alert('无法找到该表格或网络错误')
  }
}

const handleRenameTable = async () => {
  if (delId.value === null) return

  const targetTable = tableList.value.find((t) => t.id === delId.value)
  if (!targetTable) return

  const newName = prompt('请输入新的表格名称', targetTable.name)
  if (newName && newName.trim() !== '' && newName !== targetTable.name) {
    try {
      await saveRemoteTable({ id: delId.value, name: newName })
      await refreshList()
    } catch (err) {
      console.error('重命名失败:', err)
      alert('重命名失败')
    }
  }
  menuVisible.value = false
}

const handleRemoveFromList = async () => {
  if (delId.value !== null) {
    const ids = getLocalIds()
    const newIds = ids.filter((id) => id !== delId.value)
    saveLocalIds(newIds)

    await refreshList()
    if (activeId.value === delId.value) {
      activeId.value = null
    }
    menuVisible.value = false
  }
}

const handleDeleteTable = async () => {
  if (delId.value !== null) {
    if (
      confirm(
        '【危险】确定要从服务器彻底删除此表格吗？\n如果只是不想看到它，请选择“从列表移除”。\n删除后所有人都无法访问！',
      )
    ) {
      try {
        await deleteRemoteTable(delId.value)
        const ids = getLocalIds()
        const newIds = ids.filter((id) => id !== delId.value)
        saveLocalIds(newIds)

        await refreshList()
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

const handleSelectTable = (id: number) => {
  if (activeId.value === id) return
  activeId.value = id
}

const openShareBox = () => {
  if (activeId.value) shareBoxVisible.value = true
}
const handleCopyShareInfo = () => {
  if (!activeId.value) return
  navigator.clipboard
    .writeText(String(activeId.value))
    .then(() => (shareBoxVisible.value = false))
    .catch(() => alert('复制失败'))
}
const openMenu = (event: MouseEvent, id: number) => {
  position.x = event.clientX
  position.y = event.clientY
  menuVisible.value = true
  delId.value = id
}
const handleLeftDisplayChange = () => {
  leftIsDisplay.value = !leftIsDisplay.value
  listIsDisplay.value = !listIsDisplay.value
  leftSize.value = leftIsDisplay.value ? 350 : 70
  leftMinSize.value = leftIsDisplay.value ? 250 : 70
}

onMounted(async () => {
  window.addEventListener('click', () => {
    menuVisible.value = false
  })
  await refreshList()
})

onUnmounted(() => {
  window.removeEventListener('click', () => {
    menuVisible.value = false
  })
})
</script>

<style scoped>
/* 保持原有样式 */
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

/* Share Box Styles */
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
