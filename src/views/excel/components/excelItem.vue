<template>
  <div ref="excelWrapperRef" class="excel-stage">
    <div class="excel-stage__shell">
      <!-- 顶部工具栏：显示在线状态和提示信息 -->
      <div class="excel-stage__toolbar">
        <div class="excel-stage__copy">
          <span class="excel-stage__eyebrow">Live canvas</span>
          <strong>实时协同编辑区</strong>
        </div>

        <!-- 实时在线状态指示灯 -->
        <div class="connection-status" :class="{ online: isOnline }">
          <span class="connection-status__dot"></span>
          <span>{{ isOnline ? '协同已连接' : '离线或连接中' }}</span>
        </div>
      </div>

      <!-- Luckysheet 实际挂载的 DOM 容器 -->
      <div class="excel-stage__surface">
        <!-- 注意：ID 是动态的，结合了表格数据的真实 ID，防止多个表同时存在时 DOM 冲突 -->
        <div :id="`luckysheet-container-${id}`" class="sheet-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as Y from 'yjs' // Yjs: 处理协同编辑数据冲突的神器
import { WebsocketProvider } from 'y-websocket' // 专门帮 Yjs 和后端建立 WebSocket 通信的桥梁库

// 组件接收传入的表格 ID (用于进入房间) 和初始化静态数据 (可选)
const props = defineProps<{
  id: number | string
  initialData?: Record<string, unknown>[]
}>()

// ===== 状态变量 =====
const isOnline = ref(false) // websocket 连接状态，用于点亮小绿灯
const excelWrapperRef = ref<HTMLElement | null>(null) // 获取外层容器 DOM 引用，用于监听尺寸变化

// Yjs 核心实例对象
let ydoc: Y.Doc | null = null
let provider: WebsocketProvider | null = null
let yCells: Y.Map<unknown> | null = null // 专门用于存储所有单元格数据的 Y.Map 字典

// 【核心机制：防止回音墙无限循环】
// 当别人改了数据推给你，你要把数据写入本地表格(Luckysheet)，
// 但本地表格发现内容变化，又会触发 cellUpdated 钩子试图往外发。
// 这个变量 `isRemoteUpdate` 就是一个“锁”：如果是远端传来的更新，就把锁打开，禁止本地往外发。
let isRemoteUpdate = false

let resizeObserver: ResizeObserver | null = null // 监听 DOM 尺寸改变的对象

// ===== 核心方法 =====

/**
 * 封装一个安全的方法，用来把接收到的远端值写进本地 Luckysheet 表格中。
 * @param key   Yjs Map 里的键名，格式规定为 "sheet序号_行号_列号"，例如 "0_2_3" 代表第1张工作表、第3行、第4列
 * @param value 单元格的值对象
 * @param refresh 是否立即要求 Luckysheet 重新绘制画布
 */
const safeUpdateCell = (key: string, value: unknown, refresh = true) => {
  if (!window.luckysheet) return

  // 解析 key，拿到坐标信息
  const parts = key.split('_')
  if (parts.length < 3) return

  const sheetIndex = parts[0]
  const r = Number(parts[1])
  const c = Number(parts[2])

  // 安全检查：如果接收到的更新不属于当前用户正在看的这个 sheet 页，可以先不更新以防报错
  const currentSheet = window.luckysheet.getSheet()
  if (String(currentSheet.index) !== String(sheetIndex)) {
    return
  }

  const flowdata = window.luckysheet.flowdata()
  if (!flowdata || !flowdata[r]) return

  try {
    // 强制把值写入 Luckysheet，并指定是哪个 sheet 页
    window.luckysheet.setCellValue(r, c, value, {
      order: sheetIndex,
      isRefresh: refresh,
    })
  } catch (error) {
    console.warn('Luckysheet update failed:', error)
  }
}

/**
 * 初始化 Yjs 协同机制
 */
const initYjs = () => {
  ydoc = new Y.Doc() // 实例化一个 Yjs 文档对象

  // 动态拼装后端 WebSocket 地址：如果前端是 https，ws 就得用 wss 协议加密
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const wsPath = "/tool-ws" // 【注意】这里写死了后端服务端口 3000，如果你改了后端端口这里也要改
  const wsUrl = `${protocol}//${host}${wsPath}`

  // 初始化提供者，连接后端，并把房间 ID (`props.id`) 作为房间号，把本地的 ydoc 传进去双向绑定
  provider = new WebsocketProvider(wsUrl, String(props.id), ydoc)

  // 监听网络状态变更，更新 UI 上的小绿灯
  provider.on('status', (event: { status: string }) => {
    isOnline.value = event.status === 'connected'
  })

  // 【初始化全量同步】：当刚刚连上服务器，把服务器端保存的庞大历史数据一次性拉取下来时触发
  provider.on('sync', (isSynced: boolean) => {
    if (isSynced && yCells) {
      isRemoteUpdate = true // 上锁：这些是历史数据恢复，千万不要再向服务器重发一次！

      try {
        let count = 0
        // 遍历所有拿到的单元格数据
        yCells.forEach((value, key) => {
          safeUpdateCell(key, value, false) // 写入表格，这里传 false 告诉表格先别重绘，攒着
          count++
        })

        // 所有数据灌完之后，统一让 Luckysheet 重新渲染一次画布，提升性能
        if (count > 0 && window.luckysheet) {
          window.luckysheet.refresh()
        }
      } catch (error) {
        console.error('Restore sync data failed:', error)
      } finally {
        isRemoteUpdate = false // 解锁：恢复完毕，接下来手敲的字可以正常发给服务器了
      }
    }
  })

  // 从 ydoc 中获取一个名叫 'cells' 的共享字典 (Map)
  yCells = ydoc.getMap('cells')

  // 【监听别人在编辑】：观察这个 'cells' 字典发生了什么变化
  yCells.observe((event) => {
    if (!window.luckysheet) return

    isRemoteUpdate = true // 上锁：这是别人传过来的增量修改，别再当成自己的改动发回去了

    try {
      // 遍历所有发生改变的键（可能同时多个人改了多个单元格）
      event.changes.keys.forEach((change, key) => {
        // 如果是新增内容或者更新了内容
        if (change.action === 'add' || change.action === 'update') {
          safeUpdateCell(key, yCells?.get(key), true) // 拿到最新值并写入本地表格（单点更新，立即重绘）
        }
      })
    } catch (error) {
      console.error('Yjs observe error:', error)
    } finally {
      isRemoteUpdate = false // 解锁
    }
  })
}

/**
 * 初始化 Luckysheet 表格实例
 */
const initSheet = () => {
  if (!window.luckysheet) return

  // 定义空白表格的默认数据结构
  const defaultData = [
    { name: 'Sheet1', color: '', status: 1, order: 0, data: [], config: {}, index: 0 },
  ]

  // 如果父组件传了 initialData 就用传进来的，否则用空白
  const initialData =
    props.initialData && props.initialData.length > 0 ? props.initialData : defaultData

  // 调用全局方法创建表格
  window.luckysheet.create({
    container: `luckysheet-container-${props.id}`, // 挂载到指定的 DOM ID
    title: '协同表格',
    lang: 'zh', // 强制中文
    showinfobar: false, // 隐藏 Luckysheet 默认的顶部返回栏（因为我们有自己的外壳了）
    data: initialData,
    hook: {
      // 【关键钩子】：当本地用户修改了某个单元格的内容后触发
      cellUpdated: (r: number, c: number, oldValue: unknown, newValue: unknown) => {
        // 如果此时 isRemoteUpdate 是 true，说明这改动本来就是从服务器刚收到的，直接 return 掉！防止死循环。
        if (isRemoteUpdate || !yCells) return

        const currentSheet = window.luckysheet.getSheet()
        // 按照约定格式拼装这个单元格对应的 Key
        const key = `${currentSheet.index}_${r}_${c}`
        const existingValue = yCells.get(key)

        // 优化手段：如果值其实没真正改变，就不浪费网络发请求了
        if (JSON.stringify(existingValue) === JSON.stringify(newValue)) {
          return
        }

        // 用 transact 包裹一次事务，往 yCells 里塞新值。
        // 这行代码执行后，y-websocket 会在底层自动捕捉到变化，并把它广播给房间里的所有人
        ydoc?.transact(() => {
          yCells?.set(key, newValue)
        })
      },
    },
  })
}

// ===== 组件生命周期 =====
onMounted(() => {
  // 先把表格空壳画出来
  initSheet()

  // 稍微延迟 100ms 再连 WebSocket，防止表格还没完全 ready 就疯狂塞数据导致错位
  setTimeout(() => {
    initYjs()
  }, 100)

  // 监听包裹容器的尺寸变化
  if (excelWrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // 当侧边栏收起/展开，或者浏览器窗口大小变化时，强制 Luckysheet 重新计算画布尺寸
      requestAnimationFrame(() => {
        window.luckysheet?.resize()
      })
    })

    resizeObserver.observe(excelWrapperRef.value)
  }
})

// 组件销毁前的清理工作：非常重要，否则来回切换表格会导致内存泄漏和多重连接重叠
onBeforeUnmount(() => {
  // 1. 断开监听尺寸变化的探头
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // 2. 彻底断开 WebSocket 连接和销毁 Yjs 文档
  if (provider) provider.destroy()
  if (ydoc) ydoc.destroy()

  // 3. 销毁全局注入的 Luckysheet 画布
  if (window.luckysheet) window.luckysheet.destroy()
})
</script>

<style scoped>
/* 样式保持不变 */
.excel-stage {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.excel-stage__shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 18px;
  border: 1px solid rgba(46, 58, 47, 0.08);
  border-radius: 26px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(245, 247, 243, 0.98)),
    radial-gradient(circle at top left, rgba(30, 109, 90, 0.08), transparent 24%);
  box-shadow: var(--app-shadow-sm);
}

.excel-stage__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}

.excel-stage__copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.excel-stage__eyebrow {
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.excel-stage__copy strong {
  font-size: 18px;
}

.excel-stage__surface {
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(46, 58, 47, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  overflow: hidden;
}

.sheet-container {
  width: 100%;
  height: 100%;
}

.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(188, 76, 58, 0.14);
  border-radius: 999px;
  background: rgba(188, 76, 58, 0.1);
  color: var(--app-danger);
  box-shadow: var(--app-shadow-sm);
  white-space: nowrap;
}

.connection-status.online {
  border-color: rgba(30, 109, 90, 0.16);
  background: rgba(30, 109, 90, 0.12);
  color: var(--app-primary-strong);
}

.connection-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

@media (max-width: 720px) {
  .excel-stage__shell {
    padding: 14px;
  }

  .excel-stage__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
