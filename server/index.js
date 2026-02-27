import 'dotenv/config' // 自动读取项目根目录下的 .env 文件中的环境变量
import express from 'express' // 基于 Node.js 的 Web 框架，用于编写 HTTP 接口
import mongoose from 'mongoose' // MongoDB 的对象模型工具，用于便捷操作数据库
import cors from 'cors' // 解决跨域请求问题的中间件
import {
  WebSocketServer
} from 'ws' // WebSocket 服务器，用于建立长连接
import http from 'http' // Node.js 原生 HTTP 模块，用于挂载 Express 和 WS
import * as Y from 'yjs' // Yjs 核心库，处理协同算法 (CRDT)

// ==========================================
// 核心修复：处理老旧 CJS 模块与现代 ESM 模块的兼容性问题
// ==========================================
// 因为 y-websocket 和 y-mongodb-provider 官方包部分支持 ESM (ECMAScript Modules) 不是很好，
// 直接 import 可能会拿不到里面的方法，所以这里采取了 `|| 默认导出` 的兼容性写法。

import * as YWebsocketUtils from 'y-websocket/bin/utils'
// setupWSConnection: y-websocket 提供的核心方法，把普通的 websocket 连接接管为 Yjs 协同连接
const setupWSConnection =
  YWebsocketUtils.setupWSConnection || YWebsocketUtils.default?.setupWSConnection
// setPersistence: 绑定持久化存储的方法
const setPersistence = YWebsocketUtils.setPersistence || YWebsocketUtils.default?.setPersistence

import * as YMongodbProvider from 'y-mongodb-provider'
// MongodbPersistence: y-mongodb-provider 提供的类，专门用于把 Yjs 数据存到 MongoDB
const MongodbPersistence =
  YMongodbProvider.MongodbPersistence || YMongodbProvider.default?.MongodbPersistence

if (!setupWSConnection) console.error('❌ 严重错误: setupWSConnection 加载失败')
if (!MongodbPersistence) console.error('❌ 严重错误: MongodbPersistence 加载失败')

// ==========================================
// Express 服务器初始化配置
// ==========================================
const app = express()
// 创建一个底层的 HTTP 服务器，把 express 实例传进去。
// 这样做是为了让 HTTP 请求和 WebSocket 请求可以共用同一个端口 (例如 3000)。
const server = http.createServer(app)

app.use(cors()) // 允许前端跨域访问

// 解析请求体中的 JSON 和 URL-encoded 数据
// 注意：因为表格数据有时会非常庞大，所以这里特意将 body 限制放宽到了 '50mb'
app.use(express.json({
  limit: '50mb'
}))
app.use(express.urlencoded({
  limit: '50mb',
  extended: true
}))

// 自定义 HTTP 请求日志中间件
app.use((req, res, next) => {
  // 忽略健康检查接口的日志，防止日志刷屏
  if (req.url !== '/health') {
    console.log(`[${new Date().toLocaleTimeString()}] HTTP ${req.method} ${req.url}`)
  }
  next() // 把请求放行给下一个路由
})

// ==========================================
// 数据库连接 (MongoDB)
// ==========================================
const MONGO_URI = process.env.MONGO_URI // 从 .env 取出数据库连接字符串

if (!MONGO_URI) {
  console.error('❌ 未配置 MongoDB 连接字符串 (MONGO_URI)')
  process.exit(1) // 没配数据库直接停掉服务，避免出现灵异问题
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB 连接成功！'))
  .catch((err) => console.error('❌ MongoDB 连接失败:', err))

// ==========================================
// MongoDB 数据模型定义 (Schema)
// 注意：这里存的是表格的【基础元数据】(名字、创建时间等)，
// 而表格【内部的每一个单元格数据】是由下方的 Yjs Provider 专门管理的！
// ==========================================
const tableSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true, // 表格 ID 必须唯一
    index: true, // 加索引提升查询速度
  },
  name: {
    type: String,
    required: true, // 表格名称
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    default: [], // 预留字段，通常 Yjs 会接管实际内容，此字段可用于存储初始静态结构
  },
  updatedAt: {
    type: Number,
    default: () => Date.now(), // 更新时间戳
  },
  isDeleted: {
    type: Boolean,
    default: false, // 软删除标记 (如果不需要彻底删除的话，可以把此字段置为 true)
  },
})

// 编译成模型
const TableModel = mongoose.model('ExcelTable', tableSchema)


// ==========================================
// Yjs 数据持久化配置 (极其关键)
// 作用：如果服务器重启，之前大家协同编辑的表格数据不会丢失。
// ==========================================
let mdb
try {
  if (MongodbPersistence) {
    // 实例化 MongoDB 存储提供者
    mdb = new MongodbPersistence(MONGO_URI, {
      collectionName: 'yjs-transactions', // 数据库中专门用来存协同二进制流的表名
      flushSize: 100, // 每凑够 100 次细微的修改操作，就打包合并成一条大数据存进库里，优化性能
      multipleCollections: true,
    })
    console.log('✅ Yjs MongoDB Persistence 初始化成功')
  }
} catch (err) {
  console.error('❌ Yjs Persistence 初始化失败:', err)
}

// 绑定持久化事件：告诉 y-websocket 库，"你要怎样从数据库读取数据，又要怎样把数据写进数据库"
if (mdb && setPersistence) {
  setPersistence({
    // 当有第一个用户进入某个表格房间时触发 (从库里捞数据到内存)
    bindState: async (docName, ydoc) => {
      try {
        // docName 通常就是前端传过来的 表格ID (roomId)
        const persistedYdoc = await mdb.getYDoc(docName) // 从数据库拉取历史的协同二进制文档
        const newUpdates = Y.encodeStateAsUpdate(ydoc) // 获取当前内存里的初始状态
        await mdb.storeUpdate(docName, newUpdates) // 更新一下存储层
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc)) // 把历史数据应用到当前的 ydoc 上，实现数据恢复
      } catch (err) {
        console.error(`[Yjs] bindState 错误 (Room: ${docName}):`, err)
      }
    },
    // 当内存里的 ydoc 发生改变时触发 (从内存写回到库里)
    writeState: async (docName, ydoc) => {
      try {
        const newUpdates = Y.encodeStateAsUpdate(ydoc) // 将修改转化为二进制增量包
        await mdb.storeUpdate(docName, newUpdates) // 写入 MongoDB
      } catch (err) {
        console.error(`[Yjs] writeState 错误 (Room: ${docName}):`, err)
      }
    },
  })
}

// ==========================================
// WebSocket 协同核心逻辑
// ==========================================
// 创建 ws 服务器，并挂载到刚才创建的 HTTP server 上。
// 此时，发往这台服务器的 ws:// 协议请求会被这里拦截，http:// 协议则由上方的 express 处理。
const wss = new WebSocketServer({
  server
})

// 监听客户端的连接请求
wss.on('connection', (conn, req) => {
  // req.url 通常长这样: "/17154234123"。 slice(1) 就是把前面的斜杠去掉，拿到房间 ID
  const roomId = req.url.slice(1)
  console.log(`🔌 新 WebSocket 连接: ${roomId}`)

  if (!roomId) {
    conn.close() // 如果没有房间 ID 视为非法连接，直接踢掉
    return
  }

  try {
    if (setupWSConnection) {
      // 交给 y-websocket 的魔法函数处理
      // 这个函数内部会自动管理房间、广播每个人的修改、心跳检测等复杂的协同逻辑
      setupWSConnection(conn, req, {
        docName: roomId
      })
    } else {
      console.error('setupWSConnection 未定义，无法处理连接')
      conn.close()
    }
  } catch (err) {
    console.error(`❌ WebSocket 建立失败 (Room: ${roomId}):`, err)
    conn.close()
  }
})

// ==========================================
// 常规 RESTful API 接口 (供前端增删改查表格元数据)
// ==========================================

/**
 * 1. 获取所有的表格列表
 */
app.get('/api/table/list', async (req, res) => {
  try {
    // 查找所有 isDeleted 为 false 的记录，按照更新时间倒序排列
    const list = await TableModel.find({
        isDeleted: false
      }, {
        id: 1,
        name: 1,
        updatedAt: 1,
        _id: 0
      })
      .sort({
        updatedAt: -1
      })
    res.json({
      code: 200,
      data: list,
      msg: '获取列表成功'
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      code: 500,
      msg: '服务器错误'
    })
  }
})

/**
 * 2. 获取单个表格的详情数据
 */
app.get('/api/table/detail/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const table = await TableModel.findOne({
      id: id,
      isDeleted: false
    }, {
      _id: 0
    })
    if (!table) return res.status(404).json({
      code: 404,
      msg: '表格不存在'
    })

    res.json({
      code: 200,
      data: table.content,
      updatedAt: table.updatedAt,
      msg: '成功'
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message
    })
  }
})

/**
 * 3. 保存/创建新表格 (或者用来重命名表格)
 */
app.post('/api/table/save', async (req, res) => {
  try {
    const {
      id,
      name
    } = req.body
    const updateData = {
      name,
      updatedAt: Date.now(),
      isDeleted: false,
    }
    // findOneAndUpdate 配合 upsert: true。
    // 意思是：如果库里有这个 id，就更新它(比如重命名)；如果没有这个 id，就新增一条记录。
    const result = await TableModel.findOneAndUpdate({
      id: id
    }, {
      $set: updateData
    }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    })
    res.json({
      code: 200,
      data: {
        id: result.id
      },
      msg: '保存成功'
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message
    })
  }
})

/**
 * 4. 彻底删除表格
 */
app.post('/api/table/delete', async (req, res) => {
  try {
    const {
      id
    } = req.body
    // 从常规数据库中硬删除该表格的元数据
    await TableModel.deleteOne({
      id: id
    })
    // 如果存在 Yjs 持久化实例，把存放在 yjs-transactions 里的二进制协同记录也彻底清空
    if (mdb) await mdb.clearDocument(String(id))

    res.json({
      code: 200,
      msg: '删除成功'
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message
    })
  }
})

/**
 * 5. 校验用户本地的 ID 列表是否在服务器上有效
 * 前端会在刷新页面时调用，把本地 localStorage 存的 ID 发过来，如果服务器上已经被删了，就不回传。
 */
app.post('/api/table/validate', async (req, res) => {
  try {
    const list = req.body
    if (!Array.isArray(list)) return res.status(400).json({
      code: 400,
      msg: 'Error'
    })

    const ids = list.map((item) => item.id)
    // 批量查询存在的 ID
    const validTables = await TableModel.find({
      id: {
        $in: ids
      },
      isDeleted: false
    }, {
      id: 1,
      name: 1,
      updatedAt: 1,
      _id: 0
    })
    res.json({
      code: 200,
      data: validTables,
      msg: '校验成功'
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message
    })
  }
})

// ==========================================
// 启动服务器
// ==========================================
const PORT = process.env.PORT || 3000
// 必须启动 server(HTTP包装层) 而不是 app(Express层)，否则 WebSocket 无法共享端口
server.listen(PORT, () => {
  console.log(`🚀 服务运行在 http://localhost:${PORT}`)
  console.log(`🔌 WebSocket 协同服务已就绪`)
})
