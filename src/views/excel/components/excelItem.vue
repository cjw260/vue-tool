<template>
  <!-- 绑定 ref 以便监听外层容器的尺寸变化 -->
  <div ref="excelWrapperRef" class="excel-wrapper">
    <!-- Luckysheet 挂载的 DOM 容器，ID 必须是唯一的以防止冲突 -->
    <div :id="`luckysheet-container-${id}`" class="sheet-container"></div>

    <!-- 右上角的连接状态指示器，根据 WebSocket 连接情况动态改变样式和文本 -->
    <div class="connection-status" :class="{ online: isOnline }">
      {{ isOnline ? '已连接协同' : '离线/连接中...' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as Y from 'yjs' // Yjs: 用于解决分布式系统协同冲突的核心库 (CRDT算法)
import { WebsocketProvider } from 'y-websocket' // Yjs 的 WebSocket 网络传输提供者

const props = defineProps<{
  id: number | string // 当前组件需要加载的协同房间(表格)ID
  initialData?: Record<string, unknown>[] // 允许从外部传入表格初始配置数据
}>()

// ==========================================
// 状态与引用
// ==========================================
const isOnline = ref(false) // 标识当前 websocket 连接状态
const excelWrapperRef = ref<HTMLElement | null>(null) // 容器 DOM 的引用，用于监听尺寸变化

// ==========================================
// 协同相关核心变量
// ==========================================
let ydoc: Y.Doc | null = null // Yjs 的文档实例对象
let provider: WebsocketProvider | null = null // WebSocket 同步实例
let yCells: Y.Map<unknown> | null = null // 核心数据结构: Y.Map 用于存储所有的单元格数据
let isRemoteUpdate = false // **极其关键的标志位**：标识当前表格的更新是否来自"远端"。用于防止【收到远端更新 -> 改变本地视图 -> 触发本地编辑事件 -> 再次发送给远端】引起的无限死循环。
let resizeObserver: ResizeObserver | null = null // 用于监听容器大小变化以适配 Luckysheet

// ==========================================
// 核心逻辑函数
// ==========================================

/**
 * 安全地更新 Luckysheet 单元格通用方法
 * @param key 数据在 Yjs 里的键名规则为 "sheetIndex_r_c" (例如 "0_1_2" 代表 第0个sheet，第1行，第2列)
 * @param value 单元格最新的值对象
 * @param refresh 是否立即刷新 Luckysheet 的 UI 面板 (批量导入时需设为 false 提高性能)
 */
const safeUpdateCell = (key: string, value: unknown, refresh = true) => {
  // 如果 Luckysheet 没加载好，直接跳过
  if (!window.luckysheet) return

  // 解析出 sheet 索引、行号、列号
  const parts = key.split('_')
  if (parts.length < 3) return

  const sheetIndex = parts[0]
  const r = Number(parts[1])
  const c = Number(parts[2])

  // 1. 检查收到更新的 sheet 是否是用户当前正在浏览的 sheet
  // (Luckysheet 对于非激活状态下的 sheet 跨表操作支持并不理想，需要控制)
  const currentSheet = window.luckysheet.getSheet()
  if (String(currentSheet.index) !== String(sheetIndex)) {
    return // 当前未在看此表，暂不执行强制写入操作
  }

  // 2. 边界检查：确保待更新的坐标未超出当前表格数据范围
  const flowdata = window.luckysheet.flowdata()
  if (!flowdata) return

  // flowdata 包含了当前渲染的真实数据矩阵
  // 如果远端发来的行号超出了本地最大行，丢弃此操作（通常在协同中应该保持初始化宽高一致）
  if (!flowdata[r]) {
    console.warn(`忽略更新: 行号 ${r} 超出当前表格范围 (最大行: ${flowdata.length})`)
    return
  }

  // 3. 执行更新
  try {
    window.luckysheet.setCellValue(r, c, value, {
      order: sheetIndex,
      isRefresh: refresh, // 关键：如果批量更新设为 false 会大幅减少页面卡顿，由调用方在最后统一刷新
    })
  } catch (err) {
    console.warn('Luckysheet update failed:', err)
  }
}

/**
 * 初始化 Yjs 协同服务
 */
const initYjs = () => {
  ydoc = new Y.Doc() // 实例化 CRDT 根文档

  // 构造 websocket 连接地址
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname
  const port = '3000' // 你的 y-websocket 服务器端口
  const wsUrl = `${protocol}//${host}:${port}`

  // 初始化 Provider，将文档连接到指定房间 (roomName = 表格ID)
  provider = new WebsocketProvider(wsUrl, String(props.id), ydoc)

  // 监听网络连接状态，以改变界面上的"已连接/离线"提示
  provider.on('status', (event: { status: string }) => {
    isOnline.value = event.status === 'connected'
  })

  // 监听 "初次同步完成" 事件：用于新用户刚进房间时，拉取云端已有的全量历史数据
  provider.on('sync', (isSynced: boolean) => {
    if (isSynced && yCells) {
      console.log('🔗 已同步云端数据，开始恢复表格内容...')

      // 开启“防循环屏蔽”，因为接下来的操作全是代码触发的，不是用户用鼠标键盘改的
      isRemoteUpdate = true
      try {
        let count = 0
        // 1. 遍历 Y.Map 中的所有记录，逐个恢复到 Luckysheet 面板
        yCells.forEach((value, key) => {
          safeUpdateCell(key, value, false) // 批量恢复：false代表先不要重绘UI
          count++
        })
        console.log(`同步完成：恢复了 ${count} 个单元格`)

        // 2. 全部数据恢复写入完毕后，统一执行一次 UI 强制刷新
        if (count > 0 && window.luckysheet) {
          window.luckysheet.refresh()
        }
      } catch (err) {
        console.error('同步数据恢复失败:', err)
      } finally {
        // 数据恢复结束，解除屏蔽。之后用户手动操作可正常向外发送了
        isRemoteUpdate = false
      }
    }
  })

  // 获取 Y.Map 实例（所有单元格的公共数据仓库）
  yCells = ydoc.getMap('cells')

  // 监听 Y.Map 的细微变化（增量更新：通常是别的同事在他们的电脑上改了某个格子）
  yCells.observe((event) => {
    if (!window.luckysheet) return

    // 同样，收到别人的数据更新本地时，也要开启屏蔽，防止又把别人的修改当成自己的修改反弹出去
    isRemoteUpdate = true
    try {
      // 遍历所有发生变更的 key
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const newValue = yCells?.get(key)
          // 是单次/增量更新，可以直接重绘 UI (refresh = true)
          safeUpdateCell(key, newValue, true)
        }
      })
    } catch (e) {
      console.error('Yjs observe error:', e)
    } finally {
      // 更新结束，解除屏蔽
      isRemoteUpdate = false
    }
  })
}

/**
 * 初始化 Luckysheet 表格渲染
 */
const initSheet = () => {
  if (!window.luckysheet) return

  // 默认一个空表格页
  const defaultData = [
    { name: 'Sheet1', color: '', status: 1, order: 0, data: [], config: {}, index: 0 },
  ]

  const initialData =
    props.initialData && props.initialData.length > 0 ? props.initialData : defaultData

  // 调用 Luckysheet 初始化方法
  window.luckysheet.create({
    container: `luckysheet-container-${props.id}`, // 将实例挂载到对应 div
    title: '协同表格',
    lang: 'zh',
    showinfobar: false, // 隐藏顶部多余的信息栏
    data: initialData,

    hook: {
      // 🔥 核心钩子：当用户在界面上手动修改了任何一个单元格时触发
      cellUpdated: function (r: number, c: number, oldValue: unknown, newValue: unknown) {
        // 【关键防御】如果 isRemoteUpdate 为 true，说明这次修改是 `Yjs observe` 或者 `sync` 自动写入的，
        // 并不是用户用鼠标键盘编辑的！此时绝对不能向外发广播，直接 return 打断！
        if (isRemoteUpdate) return

        // 如果确定是用户本人的操作，则向 Yjs 网络广播
        if (yCells) {
          const currentSheet = window.luckysheet.getSheet()
          const sheetIndex = currentSheet.index
          const key = `${sheetIndex}_${r}_${c}` // 拼凑出唯一坐标键名

          const existingValue = yCells.get(key)
          // 深度比较，如果新老值根本没有实质变化，就不要发送无用数据造成网络负担
          if (JSON.stringify(existingValue) === JSON.stringify(newValue)) {
            return
          }

          // 将修改包装进 Yjs 的事务 (transact) 中执行，广播给所有房间内的其他人
          ydoc?.transact(() => {
            yCells?.set(key, newValue)
          })
        }
      },
    },
  })
}

// ==========================================
// 生命周期管理
// ==========================================

onMounted(() => {
  // 1. 先初始化本地 UI 面板
  initSheet()

  // 2. 稍微延迟 100ms 再去连 WebSocket 服务。
  // 原因是确保 Luckysheet 内部 DOM 完全生成渲染完毕，否则过早收到网络数据会找不到对应格子导致报错。
  setTimeout(() => {
    initYjs()
  }, 100)

  // 3. 性能优化：动态监听窗口和父容器变化。
  // 相比于直接监听 window.resize，ResizeObserver 能更精准地捕获当前组件由于分栏拖拽导致的宽度改变，
  // 触发 Luckysheet 重新计算画布布局。
  if (excelWrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // 放入下一帧执行，防止 ResizeObserver 抛出 "loop limit exceeded" 错误
      requestAnimationFrame(() => {
        window.luckysheet?.resize()
      })
    })
    resizeObserver.observe(excelWrapperRef.value)
  }
})

onBeforeUnmount(() => {
  // 组件销毁前的重要清理工作，防止内存暴涨和重复监听

  // 1. 销毁尺寸监听器
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // 2. 销毁 WebSocket 协同提供者与文档
  if (provider) provider.destroy()
  if (ydoc) ydoc.destroy()

  // 3. 销毁 Luckysheet 实例
  if (window.luckysheet) window.luckysheet.destroy()
})
</script>

<style scoped>
/* 使用 Flex 布局使表格填满父容器 */
.excel-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sheet-container {
  flex: 1;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;
}

/* 协同连接状态标签 UI */
.connection-status {
  position: absolute;
  top: 8px;
  right: 80px;
  z-index: 1000;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background-color: #f56c6c; /* 红色代表离线或断开 */
  color: white;
  pointer-events: none; /* 穿透鼠标点击事件，不阻挡用户的表格操作 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.connection-status.online {
  background-color: #67c23a; /* 绿色代表连接成功 */
}
</style>
