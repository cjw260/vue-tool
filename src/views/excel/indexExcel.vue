<template>
  <!--
    ====== 全局弹窗区域 ======
    为了不影响页面流，所有的弹窗和右键菜单都通过 v-if 控制并使用了绝对/固定定位
  -->

  <!-- 右键菜单：在左侧列表项上右键时触发 -->
  <div
    v-if="menuVisible"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    class="context-menu"
  >
    <button type="button" class="context-menu__item" @click.stop="openRenameDialog">
      重命名表格
    </button>
    <!-- 仅从本地列表移除，别人依然可以访问 -->
    <button type="button" class="context-menu__item" @click.stop="handleRemoveFromList">
      仅从列表移除
    </button>
    <!-- 彻底从服务器抹除数据，所有人都无法访问 -->
    <button
      type="button"
      class="context-menu__item context-menu__item--danger"
      @click.stop="openDeleteDialog"
    >
      彻底删除
    </button>
  </div>

  <!-- 分享弹窗：展示当前表格 ID 供用户复制给同事 -->
  <div v-if="shareBoxVisible" class="dialog-overlay" @click.self="shareBoxVisible = false">
    <!-- ... (UI结构) ... -->
    <div class="dialog-card">
      <div class="dialog-card__header">
        <div>
          <span class="dialog-card__kicker">Share workspace</span>
          <h3>共享当前表格</h3>
        </div>
        <button type="button" class="dialog-card__close" @click="shareBoxVisible = false">×</button>
      </div>
      <div class="dialog-card__body">
        <div class="dialog-card__hero">
          <span class="dialog-card__hero-label">当前文档</span>
          <strong>{{ activeTable?.name || '未选择表格' }}</strong>
        </div>
        <div class="dialog-field">
          <label>表格 ID</label>
          <div class="dialog-value">{{ activeId ?? '--' }}</div>
        </div>
        <p class="dialog-tip">把这个 ID 发给协作者，对方输入后即可加入同一份在线表格。</p>
      </div>
      <div class="dialog-card__footer">
        <button type="button" class="ui-btn ui-btn--ghost" @click="shareBoxVisible = false">
          关闭
        </button>
        <button type="button" class="ui-btn ui-btn--primary" @click="handleCopyShareInfo">
          复制 ID
        </button>
      </div>
    </div>
  </div>

  <!-- 加入其他表格弹窗：用户输入同事分享的 ID -->
  <div v-if="addOtherBoxVisible" class="dialog-overlay" @click.self="addOtherBoxVisible = false">
    <div class="dialog-card">
      <div class="dialog-card__header">
        <div>
          <span class="dialog-card__kicker">Join workspace</span>
          <h3>加入协同表格</h3>
        </div>
        <button type="button" class="dialog-card__close" @click="addOtherBoxVisible = false">×</button>
      </div>
      <div class="dialog-card__body">
        <div class="dialog-field">
          <label for="remote-table-id">共享 ID</label>
          <input
            id="remote-table-id"
            v-model="otherTableId"
            class="dialog-input"
            placeholder="请输入协作者分享给你的表格 ID"
            @keyup.enter="confirmAddOtherTable"
          />
        </div>
        <p class="dialog-tip">加入后，这份表格会同步写入你的本地列表，方便后续直接打开。</p>
      </div>
      <div class="dialog-card__footer">
        <button type="button" class="ui-btn ui-btn--ghost" @click="addOtherBoxVisible = false">取消</button>
        <button type="button" class="ui-btn ui-btn--primary" @click="confirmAddOtherTable">加入表格</button>
      </div>
    </div>
  </div>

  <!-- 重命名弹窗 -->
  <div v-if="renameDialogVisible" class="dialog-overlay" @click.self="renameDialogVisible = false">
    <div class="dialog-card">
      <div class="dialog-card__header">
        <div>
          <span class="dialog-card__kicker">Rename document</span>
          <h3>重命名表格</h3>
        </div>
        <button type="button" class="dialog-card__close" @click="renameDialogVisible = false">×</button>
      </div>
      <div class="dialog-card__body">
        <div class="dialog-field">
          <label for="rename-table-name">表格名称</label>
          <input
            id="rename-table-name"
            v-model="renameValue"
            class="dialog-input"
            maxlength="40"
            placeholder="请输入新的表格名称"
            @keyup.enter="submitRenameTable"
          />
        </div>
        <p class="dialog-tip">推荐使用清晰的业务名，协作者会在侧边栏看到同样的名称。</p>
      </div>
      <div class="dialog-card__footer">
        <button type="button" class="ui-btn ui-btn--ghost" @click="renameDialogVisible = false">取消</button>
        <button type="button" class="ui-btn ui-btn--primary" @click="submitRenameTable">保存名称</button>
      </div>
    </div>
  </div>

  <!-- 彻底删除警告弹窗 -->
  <div v-if="deleteDialogVisible" class="dialog-overlay" @click.self="deleteDialogVisible = false">
    <div class="dialog-card dialog-card--danger">
      <div class="dialog-card__header">
        <div>
          <span class="dialog-card__kicker">Delete forever</span>
          <h3>彻底删除表格</h3>
        </div>
        <button type="button" class="dialog-card__close" @click="deleteDialogVisible = false">×</button>
      </div>
      <div class="dialog-card__body">
        <div class="dialog-warning">
          <strong>{{ currentMenuTable?.name || '当前表格' }}</strong>
          <p>删除后会同时移除云端协同内容，所有加入该表格的人都将无法继续访问。</p>
        </div>
        <p class="dialog-tip dialog-tip--danger">
          如果你只是暂时不想在左侧栏看到它，请使用“仅从列表移除”。
        </p>
      </div>
      <div class="dialog-card__footer">
        <button type="button" class="ui-btn ui-btn--ghost" @click="deleteDialogVisible = false">取消</button>
        <button type="button" class="ui-btn ui-btn--danger" @click="confirmDeleteTable">确认删除</button>
      </div>
    </div>
  </div>

  <!--
    ====== 主工作区布局 ======
    使用 el-splitter 实现左右分栏，左侧是列表，右侧是编辑器。边界可以拖拽调整。
  -->
  <el-splitter lazy class="workspace">
    <!-- 左侧侧边栏：文档列表与操作入口 -->
    <el-splitter-panel v-model:size="leftSize" :min="leftMinSize" :max="420">
      <aside class="workspace-sidebar" :class="{ 'workspace-sidebar--collapsed': !leftIsDisplay }">
        <div class="workspace-sidebar__top">
          <!-- 侧边栏折叠/展开按钮 -->
          <button
            type="button"
            class="workspace-sidebar__toggle"
            :aria-label="leftIsDisplay ? '收起侧栏' : '展开侧栏'"
            @click="handleLeftDisplayChange"
          >
            <img v-if="leftIsDisplay" src="@/asset/close.svg" alt="收起侧栏" class="workspace-sidebar__toggle-icon" />
            <img v-else src="@/asset/open.svg" alt="展开侧栏" class="workspace-sidebar__toggle-icon" />
          </button>

          <div v-if="leftIsDisplay" class="workspace-sidebar__intro">
            <span class="workspace-sidebar__eyebrow">Document shelf</span>
            <h2>我的协同表格</h2>
            <p>{{ tableSummary }}</p>
          </div>
        </div>

        <div class="workspace-sidebar__actions" :class="{ compact: !leftIsDisplay }">
          <button
            type="button"
            class="ui-btn ui-btn--primary ui-btn--full"
            :class="{ 'ui-btn--icon-only': !leftIsDisplay }"
            @click="handleAddTable"
          >
            <span class="ui-btn__icon">+</span>
            <span v-if="leftIsDisplay">新建表格</span>
          </button>
          <button
            type="button"
            class="ui-btn ui-btn--ghost ui-btn--full"
            :class="{ 'ui-btn--icon-only': !leftIsDisplay }"
            @click="openShareBox"
          >
            <span class="ui-btn__icon">↗</span>
            <span v-if="leftIsDisplay">分享当前表格</span>
          </button>
        </div>

        <!-- 列表渲染区域 -->
        <div class="workspace-sidebar__list">
          <template v-if="tableList.length">
            <button
              v-for="item in tableList"
              :key="item.id"
              type="button"
              :title="item.name"
              class="table-card"
              :class="{ 'table-card--active': activeId === item.id, compact: !leftIsDisplay }"
              @click="handleSelectTable(item.id)"
              @contextmenu.prevent="openMenu($event, item.id)"
            >
              <span class="table-card__accent"></span>
              <div class="table-card__avatar">
                {{ leftIsDisplay ? item.name.slice(0, 1) : getTableMonogram(item.name) }}
              </div>
              <div v-if="leftIsDisplay" class="table-card__body">
                <span class="table-card__title">{{ item.name }}</span>
                <span class="table-card__meta">最近更新 {{ formatUpdatedAt(item.updatedAt) }}</span>
              </div>
              <span v-if="leftIsDisplay" class="table-card__tag">
                #{{ String(item.id).slice(-4) }}
              </span>
            </button>
          </template>
          <!-- 列表为空时的占位提示 -->
          <div v-else class="workspace-sidebar__empty">
            <span class="workspace-sidebar__empty-title">这里还没有表格</span>
            <p>先创建一份协作表格，或者输入共享 ID 加入别人的工作区。</p>
          </div>
        </div>

        <div class="workspace-sidebar__footer">
          <button
            type="button"
            class="join-card"
            :class="{ compact: !leftIsDisplay }"
            @click="handleAddOtherTable"
          >
            <span class="join-card__icon">+</span>
            <div v-if="leftIsDisplay" class="join-card__copy">
              <strong>加入协同表格</strong>
              <span>输入共享 ID，接入同一份在线表格</span>
            </div>
          </button>
        </div>
      </aside>
    </el-splitter-panel>

    <!-- 右侧主区域：表格编辑器实体 -->
    <el-splitter-panel :min="260">
      <section class="workspace-main">
        <!-- 当有选中的表格时，挂载真实的协同编辑器组件 -->
        <template v-if="activeId && activeTable">
          <div class="workspace-main__header">
            <div class="workspace-main__heading">
              <span class="workspace-main__eyebrow">Current workspace</span>
              <h3>{{ activeTable.name }}</h3>
              <p>文档 ID {{ activeTable.id }} · 最近更新 {{ formatUpdatedAt(activeTable.updatedAt) }}</p>
            </div>
            <div class="workspace-main__actions">
              <button type="button" class="ui-btn ui-btn--ghost" @click="openShareBox">分享协作</button>
            </div>
          </div>

          <div class="workspace-main__editor">
            <!-- 核心：挂载 excelItem 组件。使用 key 绑定 ID 强制在切换表格时销毁重建组件，防止数据串线 -->
            <excelItem :key="activeId" :id="activeId" />
          </div>
        </template>

        <!-- 如果没有选中表格，展示空状态引导页 -->
        <div v-else class="workspace-empty-state">
          <span class="workspace-empty-state__eyebrow">Ready to collaborate</span>
          <h3>把表格变成一个实时协作工作区</h3>
          <p>
            在左侧建立你的文档架，右侧就是完整的编辑舞台。你可以新建表格，也可以输入共享
            ID 立即加入同事正在编辑的表格。
          </p>
          <div class="workspace-empty-state__actions">
            <button type="button" class="ui-btn ui-btn--primary" @click="handleAddTable">
              创建第一份表格
            </button>
            <button type="button" class="ui-btn ui-btn--ghost" @click="handleAddOtherTable">
              输入共享 ID
            </button>
          </div>
        </div>
      </section>
    </el-splitter-panel>
  </el-splitter>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
// 导入向后端发请求的 API 方法 (封装了 axios 或 fetch)
import {
  deleteRemoteTable,
  getRemoteTableDetail,
  saveRemoteTable,
  type RemoteTableItem,
  validateRemoteTableList,
} from '@/api/excel'
// 导入核心的表格组件
import excelItem from './components/excelItem.vue'

// 本地存储的 Key，用于在浏览器中记录用户拥有的表格 ID 列表 (无账号体系下的去中心化身份识别)
const LOCAL_STORAGE_KEY = 'my_collaborative_excel_ids'

// ===== UI 状态 =====
const leftIsDisplay = ref(true) // 左侧边栏是否展开
const leftSize = ref(320)       // 左分栏当前宽度
const leftMinSize = ref(260)    // 左分栏最小宽度

// ===== 核心数据 =====
const tableList = ref<RemoteTableItem[]>([]) // 侧边栏表格列表数据源
const activeId = ref<number | null>(null)    // 当前正在编辑的表格 ID

// ===== 弹窗控制与输入值 =====
const menuVisible = ref(false)         // 右键菜单可见性
const shareBoxVisible = ref(false)     // 分享弹窗
const addOtherBoxVisible = ref(false)  // 加入弹窗
const renameDialogVisible = ref(false) // 重命名弹窗
const deleteDialogVisible = ref(false) // 彻底删除弹窗

const otherTableId = ref('') // 用户输入的想加入的别人的表格 ID
const renameValue = ref('')  // 重命名输入框的值

const position = reactive({ x: 0, y: 0 }) // 右键菜单弹出时的 X/Y 坐标
const delId = ref<number | null>(null)    // 当前右键选中的目标表格 ID (可能和 activeId 不同)

// ===== 计算属性 =====
const tableSummary = computed(() => {
  if (!tableList.value.length) return '建立自己的文档架，随时发起或加入协作。'
  return `共 ${tableList.value.length} 份表格，右键可管理每一份文档。`
})

// 根据选中的 activeId 从列表中找出完整的 table 对象，以展示标题
const activeTable = computed(
  () => tableList.value.find((item) => item.id === activeId.value) ?? null,
)

// 根据右键选中的 delId 找出对象 (弹窗里展示要删除/改名的是谁)
const currentMenuTable = computed(
  () => tableList.value.find((item) => item.id === delId.value) ?? null,
)

// ===== 本地存储管理工具 =====
// 从 localStorage 中读取保存的表格 ID 列表
const getLocalIds = (): number[] => {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY)
    return json ? JSON.parse(json) : []
  } catch (error) {
    console.error('Read local table ids failed:', error)
    return []
  }
}
// 将列表存回 localStorage，使用 Set 去重避免重复加入
const saveLocalIds = (ids: number[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))))
}

// 格式化时间戳显示为 "12-28 14:30" 这样的人类友好格式
const formatUpdatedAt = (timestamp: number) => {
  if (!timestamp) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(timestamp)
}
// 获取首字母作为头像占位符
const getTableMonogram = (name: string) => name.trim().slice(0, 1).toUpperCase() || '#'

// 统一关闭所有弹窗和右键菜单
const closeOverlays = () => {
  menuVisible.value = false
  shareBoxVisible.value = false
  addOtherBoxVisible.value = false
  renameDialogVisible.value = false
  deleteDialogVisible.value = false
}

// ===== 核心业务逻辑 =====

/**
 * 刷新表格列表：将本地缓存的 ID 列表发给后端，后端过滤掉已被别人彻底删除的废弃 ID 后，返回真实的最新列表信息。
 */
const refreshList = async () => {
  const localIds = getLocalIds()
  if (!localIds.length) {
    tableList.value = []
    activeId.value = null
    return
  }

  try {
    // 调用后端的 /validate 接口
    const payload = localIds.map((id) => ({ id })) as unknown as RemoteTableItem[]
    const validTables = await validateRemoteTableList(payload)

    tableList.value = validTables || []

    // 同步清洗本地无效 ID
    const validIds = tableList.value.map((item) => item.id)
    if (validIds.length !== localIds.length) {
      saveLocalIds(validIds)
    }

    // 如果当前打开的表格已经被删了，清空右侧编辑区
    if (activeId.value !== null && !validIds.includes(activeId.value)) {
      activeId.value = null
    }
  } catch (error) {
    console.error('Refresh list failed:', error)
  }
}

/**
 * 新建一份协作表格
 */
const handleAddTable = async () => {
  const newId = Date.now() // 简单用时间戳作为唯一 ID
  const newName = `协同表格 ${new Date().toLocaleTimeString()}`

  try {
    await saveRemoteTable({ id: newId, name: newName }) // 通知后端创建元数据
    const ids = getLocalIds()
    ids.unshift(newId) // 加到本地列表最前面
    saveLocalIds(ids)

    await refreshList()
    activeId.value = newId // 自动激活刚创建的表格
    ElMessage.success('已创建新的协同表格')
  } catch (error) {
    console.error('Create table failed:', error)
    ElMessage.error('创建失败，请检查后端服务是否已启动')
  }
}

// 弹出“加入协同表格”的输入框
const handleAddOtherTable = () => {
  menuVisible.value = false
  otherTableId.value = ''
  addOtherBoxVisible.value = true
}

/**
 * 确认加入别人分享的表格 ID
 */
const confirmAddOtherTable = async () => {
  const inputId = Number(otherTableId.value.trim())
  if (!inputId) {
    ElMessage.warning('请输入有效的表格 ID')
    return
  }
  // 防止重复加入
  if (tableList.value.some((item) => item.id === inputId)) {
    activeId.value = inputId
    addOtherBoxVisible.value = false
    ElMessage.info('这份表格已经在你的列表中了')
    return
  }

  try {
    // 调用详情接口确认这个表是不是真的存在
    await getRemoteTableDetail(inputId)

    const ids = getLocalIds()
    ids.unshift(inputId)
    saveLocalIds(ids)

    await refreshList()
    activeId.value = inputId
    addOtherBoxVisible.value = false
    ElMessage.success('已加入协同表格')
  } catch (error) {
    console.error('Join table failed:', error)
    ElMessage.error('找不到这份表格，或当前网络连接不可用')
  }
}

// 弹出重命名对话框，设置好当前的名字
const openRenameDialog = () => {
  if (delId.value === null) return
  const target = currentMenuTable.value
  if (!target) return
  renameValue.value = target.name
  menuVisible.value = false
  renameDialogVisible.value = true
}

/**
 * 提交重命名
 */
const submitRenameTable = async () => {
  if (delId.value === null) return
  const newName = renameValue.value.trim()
  if (!newName) {
    ElMessage.warning('请输入新的表格名称')
    return
  }

  try {
    await saveRemoteTable({ id: delId.value, name: newName }) // 调用复用的 /save 接口更新名字
    await refreshList()
    renameDialogVisible.value = false
    ElMessage.success('表格名称已更新')
  } catch (error) {
    console.error('Rename table failed:', error)
    ElMessage.error('重命名失败，请稍后再试')
  }
}

/**
 * 仅从本地列表移除 (不影响云端)
 */
const handleRemoveFromList = async () => {
  if (delId.value === null) return

  const ids = getLocalIds()
  saveLocalIds(ids.filter((id) => id !== delId.value)) // 把选中的 ID 从本地数组中剔除
  await refreshList()

  if (activeId.value === delId.value) activeId.value = null
  menuVisible.value = false
  ElMessage.success('已从当前列表移除')
}

const openDeleteDialog = () => {
  if (delId.value === null) return
  menuVisible.value = false
  deleteDialogVisible.value = true
}

/**
 * 彻底删除 (会发请求让服务器干掉这个表的所有数据)
 */
const confirmDeleteTable = async () => {
  if (delId.value === null) return

  try {
    await deleteRemoteTable(delId.value) // 调用后端彻底删除接口

    const ids = getLocalIds()
    saveLocalIds(ids.filter((id) => id !== delId.value))
    await refreshList()

    if (activeId.value === delId.value) activeId.value = null
    deleteDialogVisible.value = false
    ElMessage.success('表格已彻底删除')
  } catch (error) {
    console.error('Delete table failed:', error)
    ElMessage.error('删除失败，请稍后再试')
  }
}

// 左侧列表点击选中事件
const handleSelectTable = (id: number) => {
  if (activeId.value === id) return
  activeId.value = id
}

// 弹出分享信息框
const openShareBox = () => {
  if (!activeId.value) {
    ElMessage.info('先选择一份表格，再分享给协作者')
    return
  }
  menuVisible.value = false
  shareBoxVisible.value = true
}

// 复制分享 ID 到剪贴板
const handleCopyShareInfo = async () => {
  if (!activeId.value) return
  try {
    await navigator.clipboard.writeText(String(activeId.value))
    shareBoxVisible.value = false
    ElMessage.success('表格 ID 已复制到剪贴板')
  } catch (error) {
    console.error('Copy share info failed:', error)
    ElMessage.error('复制失败，请检查浏览器权限')
  }
}

// 处理在表格项上的鼠标右键点击：定位菜单并记录目标 ID
const openMenu = (event: MouseEvent, id: number) => {
  const menuWidth = 188, menuHeight = 148
  const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight

  // 避免菜单溢出屏幕边界
  position.x = Math.min(event.clientX, viewportWidth - menuWidth - 12)
  position.y = Math.min(event.clientY, viewportHeight - menuHeight - 12)
  delId.value = id
  menuVisible.value = true
}

// 侧边栏展开/折叠切换
const handleLeftDisplayChange = () => {
  leftIsDisplay.value = !leftIsDisplay.value
  leftSize.value = leftIsDisplay.value ? 320 : 92
  leftMinSize.value = leftIsDisplay.value ? 260 : 92
}

// 点空白处关闭右键菜单
const handleWindowClick = () => {
  menuVisible.value = false
}

// 按 ESC 键关闭所有弹窗
const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeOverlays()
}

// ===== 生命周期 =====
onMounted(async () => {
  // 响应式：屏幕太小时默认折叠左侧边栏
  if (window.innerWidth < 960) {
    leftIsDisplay.value = false
    leftSize.value = 92
    leftMinSize.value = 92
  }

  // 绑定全局事件
  window.addEventListener('click', handleWindowClick)
  window.addEventListener('keydown', handleWindowKeydown)

  // 初始化时拉取最新的表格列表
  await refreshList()
})

onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
/* 样式部分保持不变，为你的定制 UI 样式 */
.workspace {
  height: 100%;
  min-height: 0;
  z-index: 1;
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  padding: 22px 16px 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(244, 246, 240, 0.94)),
    linear-gradient(135deg, rgba(190, 123, 49, 0.1), transparent 32%);
  border-right: 1px solid rgba(46, 58, 47, 0.08);
  user-select: none;
  transition:
    padding var(--app-transition),
    background var(--app-transition);
}

.workspace-sidebar--collapsed {
  padding-right: 10px;
  padding-left: 10px;
}

.workspace-sidebar__top {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.workspace-sidebar__toggle {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--app-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: var(--app-shadow-sm);
  cursor: pointer;
  transition:
    transform var(--app-transition),
    background var(--app-transition);
}

.workspace-sidebar__toggle:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.92);
}

.workspace-sidebar__toggle-icon {
  width: 16px;
  height: 16px;
}

.workspace-sidebar__intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  animation: slideIn 260ms ease;
}

.workspace-sidebar__eyebrow,
.workspace-main__eyebrow,
.workspace-empty-state__eyebrow,
.dialog-card__kicker {
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.workspace-sidebar__intro h2,
.workspace-main__heading h3,
.workspace-empty-state h3,
.dialog-card__header h3 {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
}

.workspace-sidebar__intro p,
.workspace-main__heading p,
.workspace-empty-state p,
.dialog-tip {
  margin: 0;
  color: var(--app-text-soft);
}

.workspace-sidebar__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.workspace-sidebar__actions.compact {
  justify-items: center;
}

.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition:
    transform var(--app-transition),
    border-color var(--app-transition),
    background var(--app-transition),
    color var(--app-transition),
    box-shadow var(--app-transition);
}

.ui-btn:hover {
  transform: translateY(-1px);
}

.ui-btn--full {
  width: 100%;
}

.ui-btn--icon-only {
  width: 48px;
  padding: 0;
}

.ui-btn__icon {
  font-size: 18px;
  line-height: 1;
}

.ui-btn--primary {
  background: linear-gradient(135deg, var(--app-primary), var(--app-primary-strong));
  box-shadow: var(--app-shadow-sm);
  color: #f4faf7;
}

.ui-btn--primary:hover {
  box-shadow: var(--app-shadow-md);
}

.ui-btn--ghost {
  border-color: var(--app-line);
  background: rgba(255, 255, 255, 0.68);
  color: var(--app-text);
}

.ui-btn--ghost:hover {
  border-color: var(--app-line-strong);
  background: rgba(255, 255, 255, 0.9);
}

.ui-btn--danger {
  background: linear-gradient(135deg, #d25f49, var(--app-danger));
  box-shadow: var(--app-shadow-sm);
  color: #fff4f2;
}

.workspace-sidebar__list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
}

.table-card {
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 14px 14px 0;
  border: 1px solid transparent;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  text-align: left;
  transition:
    transform var(--app-transition),
    border-color var(--app-transition),
    background var(--app-transition),
    box-shadow var(--app-transition);
}

.table-card:hover {
  transform: translateY(-1px);
  border-color: rgba(30, 109, 90, 0.12);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--app-shadow-sm);
}

.table-card.compact {
  grid-template-columns: 1fr;
  justify-items: center;
  gap: 0;
  padding: 12px 0;
}

.table-card__accent {
  width: 4px;
  height: 42px;
  border-radius: 999px;
  background: transparent;
  transition: background var(--app-transition);
}

.table-card__avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(30, 109, 90, 0.16), rgba(190, 123, 49, 0.18));
  color: var(--app-primary-strong);
  font-weight: 700;
}

.table-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.table-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}

.table-card__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-faint);
  font-size: 12px;
}

.table-card__tag {
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 700;
}

.table-card--active {
  border-color: rgba(30, 109, 90, 0.18);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(238, 244, 240, 0.98));
  box-shadow: var(--app-shadow-md);
}

.table-card--active .table-card__accent {
  background: linear-gradient(180deg, var(--app-primary), var(--app-accent));
}

.workspace-sidebar__empty {
  display: grid;
  gap: 8px;
  padding: 18px;
  border: 1px dashed rgba(46, 58, 47, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.44);
  color: var(--app-text-soft);
}

.workspace-sidebar__empty-title {
  font-weight: 700;
  color: var(--app-text);
}

.workspace-sidebar__footer {
  margin-top: auto;
}

.join-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(30, 109, 90, 0.12);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(240, 244, 239, 0.92));
  cursor: pointer;
  text-align: left;
  transition:
    transform var(--app-transition),
    border-color var(--app-transition),
    box-shadow var(--app-transition);
}

.join-card:hover {
  transform: translateY(-1px);
  border-color: rgba(30, 109, 90, 0.2);
  box-shadow: var(--app-shadow-sm);
}

.join-card.compact {
  justify-content: center;
  padding: 12px 0;
}

.join-card__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: var(--app-primary-soft);
  color: var(--app-primary-strong);
  font-size: 22px;
  line-height: 1;
}

.join-card__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.join-card__copy strong {
  font-size: 14px;
}

.join-card__copy span {
  color: var(--app-text-faint);
  font-size: 12px;
}

.workspace-main {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  min-height: 0;
  padding: 22px;
}

.workspace-main__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 2px 0;
}

.workspace-main__heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.workspace-main__editor {
  flex: 1;
  min-height: 0;
}

.workspace-empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 40px;
  border: 1px solid rgba(46, 58, 47, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(245, 247, 243, 0.94)),
    radial-gradient(circle at top right, rgba(190, 123, 49, 0.12), transparent 24%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  text-align: center;
}

.workspace-empty-state p {
  max-width: 560px;
  font-size: 15px;
}

.workspace-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.context-menu {
  position: fixed;
  z-index: 20;
  display: grid;
  gap: 6px;
  width: 188px;
  padding: 10px;
  border: 1px solid rgba(46, 58, 47, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--app-shadow-lg);
  backdrop-filter: blur(18px);
}

.context-menu__item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  cursor: pointer;
  transition:
    background var(--app-transition),
    color var(--app-transition);
}

.context-menu__item:hover {
  background: rgba(30, 109, 90, 0.08);
  color: var(--app-primary-strong);
}

.context-menu__item--danger:hover {
  background: var(--app-danger-soft);
  color: var(--app-danger);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 28, 23, 0.32);
  backdrop-filter: blur(10px);
}

.dialog-card {
  width: min(460px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 248, 244, 0.98)),
    linear-gradient(145deg, rgba(30, 109, 90, 0.08), rgba(190, 123, 49, 0.08));
  box-shadow: var(--app-shadow-lg);
  overflow: hidden;
}

.dialog-card--danger {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 244, 242, 0.98)),
    linear-gradient(145deg, rgba(188, 76, 58, 0.08), rgba(190, 123, 49, 0.06));
}

.dialog-card__header,
.dialog-card__body,
.dialog-card__footer {
  padding-right: 24px;
  padding-left: 24px;
}

.dialog-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 24px;
}

.dialog-card__close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  color: var(--app-text-faint);
  cursor: pointer;
  transition:
    background var(--app-transition),
    color var(--app-transition);
}

.dialog-card__close:hover {
  background: rgba(46, 58, 47, 0.08);
  color: var(--app-text);
}

.dialog-card__body {
  display: grid;
  gap: 18px;
  padding-top: 18px;
  padding-bottom: 22px;
}

.dialog-card__hero {
  display: grid;
  gap: 8px;
  padding: 18px;
  border: 1px solid rgba(30, 109, 90, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.68);
}

.dialog-card__hero-label {
  color: var(--app-text-faint);
  font-size: 12px;
}

.dialog-field {
  display: grid;
  gap: 8px;
}

.dialog-field label {
  font-weight: 700;
}

.dialog-input,
.dialog-value {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.dialog-input {
  outline: none;
  transition:
    border-color var(--app-transition),
    box-shadow var(--app-transition);
}

.dialog-input:focus {
  border-color: rgba(30, 109, 90, 0.32);
  box-shadow: 0 0 0 4px rgba(30, 109, 90, 0.1);
}

.dialog-value {
  display: flex;
  align-items: center;
  color: var(--app-primary-strong);
  font-family: 'Cascadia Mono', 'Consolas', monospace;
  font-size: 15px;
}

.dialog-tip {
  font-size: 13px;
}

.dialog-tip--danger {
  color: var(--app-danger);
}

.dialog-warning {
  display: grid;
  gap: 8px;
  padding: 18px;
  border: 1px solid rgba(188, 76, 58, 0.14);
  border-radius: 18px;
  background: rgba(188, 76, 58, 0.08);
}

.dialog-warning strong {
  font-size: 16px;
}

.dialog-warning p {
  margin: 0;
  color: #7c463d;
}

.dialog-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 18px;
  padding-bottom: 24px;
  background: rgba(255, 255, 255, 0.5);
}

:deep(.el-splitter__split-bar) {
  width: 16px;
}

:deep(.el-splitter__split-bar-button) {
  width: 4px;
  border-radius: 999px;
  background: rgba(46, 58, 47, 0.14);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1080px) {
  .workspace-main {
    padding: 18px;
  }

  .workspace-main__header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .workspace-main {
    padding: 14px;
  }

  .workspace-empty-state {
    padding: 28px 20px;
  }

  .dialog-card__footer {
    flex-wrap: wrap;
  }

  .dialog-card__footer .ui-btn {
    width: 100%;
  }
}
</style>
