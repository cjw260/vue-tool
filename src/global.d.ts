export {}

declare global {
  // --- Luckysheet 核心接口定义 ---

  /**
   * 选区范围接口
   * Luckysheet 的 range 通常是一个数组，包含 row 和 column 的索引范围
   */
  interface LuckysheetRange {
    row: [number, number] // [startRow, endRow]
    column: [number, number] // [startCol, endCol]
  }

  /**
   * 单个 Sheet 页面的配置对象
   * 包含当前页面的索引、行列高宽数据等
   */
  interface LuckysheetSheet {
    name: string
    color: string
    status: number // 1: active, 0: inactive
    order: number
    index: number | string // sheet 的唯一标识
    data: unknown[][] // 二维数组数据
    config: Record<string, unknown>
    visibledatarow: number[] // 行高累加数组 (用于计算像素位置)
    visibledatacolumn: number[] // 列宽累加数组 (用于计算像素位置)
  }

  /**
   * Luckysheet 初始化配置项
   */
  interface LuckysheetOptions {
    container: string
    title?: string
    lang?: string
    gridKey?: string
    loadUrl?: string
    allowUpdate?: boolean
    updateUrl?: string
    showinfobar?: boolean
    row?: number
    col?: number
    data?: Record<string, unknown>[]
    hook?: LuckysheetHooks
  }

  /**
   * Luckysheet 钩子函数定义
   */
  interface LuckysheetHooks {
    /**
     * 单元格更新回调
     * @param r 行号
     * @param c 列号
     * @param oldValue 旧值
     * @param newValue 新值
     * @param isRefresh 是否刷新界面
     */
    cellUpdated?: (
      r: number,
      c: number,
      oldValue: unknown,
      newValue: unknown,
      isRefresh: boolean,
    ) => void

    /**
     * 选区改变回调
     * @param sheet 当前 sheet 对象
     * @param range 选区范围数组
     */
    rangeSelect?: (sheet: LuckysheetSheet, range: LuckysheetRange[]) => void

    /**
     * 进入编辑模式前回调
     * @param range 当前选中的范围
     */
    cellEditBefore?: (range: LuckysheetRange[]) => void

    /**
     * 行插入后
     */
    rowInsertAfter?: (index: number) => void
    /**
     * 行删除后
     */
    rowDeleteAfter?: (index: number) => void
    /**
     * 列插入后
     */
    colInsertAfter?: (index: number) => void
    /**
     * 列删除后
     */
    colDeleteAfter?: (index: number) => void

    /**
     * 表格创建完成后
     */
    workbookCreateAfter?: (json: unknown) => void
  }

  /**
   * setCellValue 的额外选项
   */
  interface SetCellValueOptions {
    order?: number | string // 指定更新哪个 sheet (index)
    isRefresh?: boolean // 是否立即刷新 UI
    success?: () => void
  }

  /**
   * Luckysheet 全局对象接口
   */
  interface LuckysheetObject {
    /**
     * 创建表格
     */
    create: (options: LuckysheetOptions) => void

    /**
     * 销毁表格
     */
    destroy: () => void

    /**
     * 重新计算大小
     */
    resize: () => void

    /**
     * 获取所有 Sheet 的数据
     */
    getAllSheets: () => LuckysheetSheet[]

    /**
     * 获取当前激活的 Sheet 对象
     */
    getSheet: (options?: { index?: number | string }) => LuckysheetSheet

    /**
     * [新增] 获取当前表格的数据 (二维数组)
     * 用于边界检查 flowdata()[r][c]
     */
    flowdata: () => unknown[][]

    /**
     * 设置单元格的值
     * @param r 行
     * @param c 列
     * @param v 值 (可以是对象或基本类型)
     * @param options 配置项
     */
    setCellValue: (r: number, c: number, v: unknown, options?: SetCellValueOptions) => void

    /**
     * 滚动条 X 轴位置 (非官方公开属性，但源码中存在，用于协同光标计算)
     */
    scrollLeft?: number

    /**
     * 滚动条 Y 轴位置
     */
    scrollTop?: number
  }

  // --- 将类型注入全局 ---

  // 1. 允许直接在代码中使用 luckysheet 变量
  const luckysheet: LuckysheetObject

  // 2. 扩展 Window 接口
  interface Window {
    luckysheet: LuckysheetObject
  }
}
