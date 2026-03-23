<template>
  <div ref="excelWrapperRef" class="excel-stage">
    <div class="excel-stage__shell">
      <div class="excel-stage__toolbar">
        <div class="excel-stage__copy">
          <span class="excel-stage__eyebrow">Live canvas</span>
          <strong>实时协同编辑区</strong>
        </div>

        <div class="connection-status" :class="{ online: isOnline }">
          <span class="connection-status__dot"></span>
          <span>{{ isOnline ? '协同已连接' : '离线或连接中' }}</span>
        </div>
      </div>

      <div class="excel-stage__surface">
        <div :id="`luckysheet-container-${id}`" class="sheet-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const props = defineProps<{
  id: number | string
  initialData?: Record<string, unknown>[]
}>()

const isOnline = ref(false)
const excelWrapperRef = ref<HTMLElement | null>(null)

let ydoc: Y.Doc | null = null
let provider: WebsocketProvider | null = null
let yCells: Y.Map<unknown> | null = null
let isRemoteUpdate = false
let resizeObserver: ResizeObserver | null = null

const safeUpdateCell = (key: string, value: unknown, refresh = true) => {
  if (!window.luckysheet) return

  const parts = key.split('_')
  if (parts.length < 3) return

  const sheetIndex = parts[0]
  const r = Number(parts[1])
  const c = Number(parts[2])

  const currentSheet = window.luckysheet.getSheet()
  if (String(currentSheet.index) !== String(sheetIndex)) {
    return
  }

  const flowdata = window.luckysheet.flowdata()
  if (!flowdata || !flowdata[r]) return

  try {
    window.luckysheet.setCellValue(r, c, value, {
      order: sheetIndex,
      isRefresh: refresh,
    })
  } catch (error) {
    console.warn('Luckysheet update failed:', error)
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

  provider.on('sync', (isSynced: boolean) => {
    if (isSynced && yCells) {
      isRemoteUpdate = true

      try {
        let count = 0

        yCells.forEach((value, key) => {
          safeUpdateCell(key, value, false)
          count++
        })

        if (count > 0 && window.luckysheet) {
          window.luckysheet.refresh()
        }
      } catch (error) {
        console.error('Restore sync data failed:', error)
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
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          safeUpdateCell(key, yCells?.get(key), true)
        }
      })
    } catch (error) {
      console.error('Yjs observe error:', error)
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
      cellUpdated: (r: number, c: number, oldValue: unknown, newValue: unknown) => {
        if (isRemoteUpdate || !yCells) return

        const currentSheet = window.luckysheet.getSheet()
        const key = `${currentSheet.index}_${r}_${c}`
        const existingValue = yCells.get(key)

        if (JSON.stringify(existingValue) === JSON.stringify(newValue)) {
          return
        }

        ydoc?.transact(() => {
          yCells?.set(key, newValue)
        })
      },
    },
  })
}

onMounted(() => {
  initSheet()

  setTimeout(() => {
    initYjs()
  }, 100)

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
