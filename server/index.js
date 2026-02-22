import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import {
  WebSocketServer
} from 'ws'
import http from 'http'
import * as Y from 'yjs'

// --- 关键修复：CJS 模块的兼容性导入 ---
import * as YWebsocketUtils from 'y-websocket/bin/utils'

// 兼容获取 setupWSConnection 和 setPersistence
const setupWSConnection =
  YWebsocketUtils.setupWSConnection || YWebsocketUtils.default?.setupWSConnection
const setPersistence = YWebsocketUtils.setPersistence || YWebsocketUtils.default?.setPersistence

import * as YMongodbProvider from 'y-mongodb-provider'
const MongodbPersistence =
  YMongodbProvider.MongodbPersistence || YMongodbProvider.default?.MongodbPersistence

if (!setupWSConnection) console.error('❌ 严重错误: setupWSConnection 加载失败')
if (!MongodbPersistence) console.error('❌ 严重错误: MongodbPersistence 加载失败')

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(
  express.json({
    limit: '50mb',
  }),
)
app.use(
  express.urlencoded({
    limit: '50mb',
    extended: true,
  }),
)

// HTTP 日志
app.use((req, res, next) => {
  if (req.url !== '/health') {
    console.log(`[${new Date().toLocaleTimeString()}] HTTP ${req.method} ${req.url}`)
  }
  next()
})

// --- 数据库连接 ---
const MONGO_URI = process.env.MONGO_URI

if (!MONGO_URI) {
  console.error('❌ 未配置 MongoDB 连接字符串 (MONGO_URI)')
  process.exit(1)
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas 连接成功！'))
  .catch((err) => console.error('❌ MongoDB 连接失败:', err))

// --- Schema 定义 ---
const tableSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    default: [],
  },
  updatedAt: {
    type: Number,
    default: () => Date.now(),
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
})

const TableModel = mongoose.model('ExcelTable', tableSchema)

// --- Yjs 持久化配置 ---
let mdb
try {
  if (MongodbPersistence) {
    mdb = new MongodbPersistence(MONGO_URI, {
      collectionName: 'yjs-transactions',
      flushSize: 100,
      multipleCollections: true,
    })
    console.log('✅ Yjs MongoDB Persistence 初始化成功')
  }
} catch (err) {
  console.error('❌ Yjs Persistence 初始化失败:', err)
}

// 绑定持久化逻辑
if (mdb && setPersistence) {
  setPersistence({
    bindState: async (docName, ydoc) => {
      try {
        // console.log(`[Yjs] Loading document: ${docName}`)
        const persistedYdoc = await mdb.getYDoc(docName)
        const newUpdates = Y.encodeStateAsUpdate(ydoc)
        await mdb.storeUpdate(docName, newUpdates)
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc))
      } catch (err) {
        console.error(`[Yjs] bindState 错误 (Room: ${docName}):`, err)
      }
    },
    writeState: async (docName, ydoc) => {
      try {
        // console.log(`[Yjs] Writing document: ${docName}`)
        const newUpdates = Y.encodeStateAsUpdate(ydoc)
        await mdb.storeUpdate(docName, newUpdates)
      } catch (err) {
        console.error(`[Yjs] writeState 错误 (Room: ${docName}):`, err)
      }
    },
  })
}

// --- WebSocket 协同核心逻辑 ---
const wss = new WebSocketServer({
  server,
})

wss.on('connection', (conn, req) => {
  const roomId = req.url.slice(1)
  console.log(`🔌 新 WebSocket 连接: ${roomId}`)

  if (!roomId) {
    conn.close()
    return
  }

  try {
    if (setupWSConnection) {
      setupWSConnection(conn, req, {
        docName: roomId,
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

// --- API 接口 ---
app.get('/api/table/list', async (req, res) => {
  try {
    const list = await TableModel.find({
      isDeleted: false,
    }, {
      id: 1,
      name: 1,
      updatedAt: 1,
      _id: 0,
    }, ).sort({
      updatedAt: -1,
    })
    res.json({
      code: 200,
      data: list,
      msg: '获取列表成功',
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      code: 500,
      msg: '服务器错误',
    })
  }
})

app.get('/api/table/detail/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const table = await TableModel.findOne({
      id: id,
      isDeleted: false,
    }, {
      _id: 0,
    }, )
    if (!table)
      return res.status(404).json({
        code: 404,
        msg: '表格不存在',
      })
    res.json({
      code: 200,
      data: table.content,
      updatedAt: table.updatedAt,
      msg: '成功',
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message,
    })
  }
})

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
    const result = await TableModel.findOneAndUpdate({
      id: id,
    }, {
      $set: updateData,
    }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }, )
    res.json({
      code: 200,
      data: {
        id: result.id,
      },
      msg: '保存成功',
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message,
    })
  }
})

app.post('/api/table/delete', async (req, res) => {
  try {
    const {
      id
    } = req.body
    await TableModel.deleteOne({
      id: id,
    })
    if (mdb) await mdb.clearDocument(String(id))
    res.json({
      code: 200,
      msg: '删除成功',
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message,
    })
  }
})

app.post('/api/table/validate', async (req, res) => {
  try {
    const list = req.body
    if (!Array.isArray(list))
      return res.status(400).json({
        code: 400,
        msg: 'Error',
      })
    const ids = list.map((item) => item.id)
    const validTables = await TableModel.find({
      id: {
        $in: ids,
      },
      isDeleted: false,
    }, {
      id: 1,
      name: 1,
      updatedAt: 1,
      _id: 0,
    }, )
    res.json({
      code: 200,
      data: validTables,
      msg: '校验成功',
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error.message,
    })
  }
})

// --- 启动服务器 ---
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🚀 服务运行在 http://localhost:${PORT}`)
  console.log(`🔌 WebSocket 协同服务已就绪`)
})
