<template>
  <!-- 绑定 ref 以便监听尺寸变化 -->
  <div ref="excelWrapperRef" class="excel-wrapper">
    <!-- Luckysheet 容器 -->
    <div :id="`luckysheet-container-${id}`" class="sheet-container"></div>

    <!-- 连接状态指示器 -->
    <div class="connection-status" :class="{ online: isOnline }">
      {{ isOnline ? '已连接协同' : '离线/连接中...' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const props = defineProps<{
  id: number | string
  initialData?: Record<string, unknown>[]
}>()

const isOnline = ref(false)
const excelWrapperRef = ref<HTMLElement | null>(null) // 新增：容器的引用

// 协同相关变量
let ydoc: Y.Doc | null = null
let provider: WebsocketProvider | null = null
let yCells: Y.Map<unknown> | null = null
let isRemoteUpdate = false
let resizeObserver: ResizeObserver | null = null // 新增：尺寸监听器

/**
 * 更新单元格的通用方法，包含边界检查
 * @param key 键名 (sheetIndex_r_c)
 * @param value 单元格值
 * @param refresh 是否立即刷新 UI (批量导入时建议为 false)
 */
const safeUpdateCell = (key: string, value: unknown, refresh = true) => {
  if (!window.luckysheet) return

  const parts = key.split('_')
  if (parts.length < 3) return

  const sheetIndex = parts[0]
  const r = Number(parts[1])
  const c = Number(parts[2])

  // 1. 检查是否属于当前 Sheet
  // 注意：将 index 统一转为 String 对比，防止 '0' !== 0 的情况
  const currentSheet = window.luckysheet.getSheet()
  if (String(currentSheet.index) !== String(sheetIndex)) {
    // 只有当 sheetIndex 确实不匹配时才警告（忽略很多 sheet 的场景需谨慎）
    // console.warn(`Sheet 索引不匹配: 当前 ${currentSheet.index}, 目标 ${sheetIndex}`)
    return
  }

  // 2. 边界检查
  const flowdata = window.luckysheet.flowdata()
  if (!flowdata) return

  // 如果行数超出了当前表格范围，理论上应该 expand，但在协同场景下，
  // 通常最好保证各个客户端初始化时的行数一致。
  if (!flowdata[r]) {
    console.warn(`忽略更新: 行号 ${r} 超出当前表格范围 (最大行: ${flowdata.length})`)
    return
  }

  // 3. 执行更新
  try {
    window.luckysheet.setCellValue(r, c, value, {
      order: sheetIndex,
      isRefresh: refresh, // 关键：由调用方控制是否刷新
    })
  } catch (err) {
    console.warn('Luckysheet update failed:', err)
  }
}

const initYjs = () => {
  ydoc = new Y.Doc()

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname
  const port = '3000'
  const wsUrl = `${protocol}//${host}:${port}`

  provider = new WebsocketProvider(wsUrl, String(props.id), ydoc)

  provider.on('status', (event: { status: string }) => {
    isOnline.value = event.status === 'connected'
  })

  // 监听同步完成事件（初次加载数据）
  provider.on('sync', (isSynced: boolean) => {
    if (isSynced && yCells) {
      console.log('🔗 已同步云端数据，开始恢复表格内容...')
      isRemoteUpdate = true
      try {
        let count = 0
        // 1. 批量更新，暂时不刷新 UI
        yCells.forEach((value, key) => {
          safeUpdateCell(key, value, false)
          count++
        })
        console.log(`同步完成：恢复了 ${count} 个单元格`)

        // 2. 数据恢复完成后，手动执行一次刷新
        if (count > 0 && window.luckysheet) {
          window.luckysheet.refresh()
        }
      } catch (err) {
        console.error('同步数据恢复失败:', err)
      } finally {
        isRemoteUpdate = false
      }
    }
  })

  yCells = ydoc.getMap('cells')
  yCells.observe((event) => {
    if (!window.luckysheet) return

    isRemoteUpdate = true
    try {
      // 增量更新（单个操作）则允许立即刷新
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const newValue = yCells?.get(key)
          safeUpdateCell(key, newValue, true)
        }
      })
    } catch (e) {
      console.error('Yjs observe error:', e)
    } finally {
      isRemoteUpdate = false
    }
  })
}

const initSheet = () => {
  if (!window.luckysheet) return

  const defaultData = [
    { name: 'Sheet1', color: '', status: 1, order: 0, data: [], config: {}, index: 0 },
  ]

  const initialData =
    props.initialData && props.initialData.length > 0 ? props.initialData : defaultData

  window.luckysheet.create({
    container: `luckysheet-container-${props.id}`,
    title: '协同表格',
    lang: 'zh',
    showinfobar: false,
    data: initialData,

    hook: {
      cellUpdated: function (r: number, c: number, oldValue: unknown, newValue: unknown) {
        if (isRemoteUpdate) return

        if (yCells) {
          const currentSheet = window.luckysheet.getSheet()
          const sheetIndex = currentSheet.index
          const key = `${sheetIndex}_${r}_${c}`

          const existingValue = yCells.get(key)
          // 深度比较，防止循环更新
          if (JSON.stringify(existingValue) === JSON.stringify(newValue)) {
            return
          }

          ydoc?.transact(() => {
            yCells?.set(key, newValue)
          })
        }
      },
    },
  })
}

onMounted(() => {
  initSheet()
  // 稍微延迟连接 Yjs，确保 Luckysheet 已完全初始化 DOM
  setTimeout(() => {
    initYjs()
  }, 100)

  // 使用 ResizeObserver 替代 window.resize
  if (excelWrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        window.luckysheet?.resize()
      })
    })
    resizeObserver.observe(excelWrapperRef.value)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (provider) provider.destroy()
  if (ydoc) ydoc.destroy()
  if (window.luckysheet) window.luckysheet.destroy()
})
</script>

<style scoped>
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

.connection-status {
  position: absolute;
  top: 8px;
  right: 80px;
  z-index: 1000;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background-color: #f56c6c;
  color: white;
  pointer-events: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.connection-status.online {
  background-color: #67c23a;
}
</style>
