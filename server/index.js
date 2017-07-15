import Koa from 'koa'
import Nuxt from 'nuxt'
import http from 'http'
import uuid from 'uuid/v4'
import Router from 'koa-router'
import body from 'koa-body'
import fs from 'fs'
import session from 'koa-session'
import websockify from 'koa-websocket'

import Keystore from './keystore'
import MediaServer from './media'

const BIND = process.env.BIND || '127.0.0.1'
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost:' + PORT 

function dispatch () {
  const media = new MediaServer()
  const router = new Router()

  router.all('/', (ctx) => {
    const session = ctx.session
    const socket = ctx.websocket

    socket.on('error', (err) => {
      console.log(`session ${session.id} closed unexpectedly`)
    })

    socket.on('close', () => {
      console.log(`session ${session.id} closed`)
    })

    socket.on('message', async (message) => {
      const decoded = JSON.parse(message)
      console.log(`server received '${decoded.type}' message`)

      switch (decoded.type) {
        case 'start': {
          session.stream = uuid()
          try {
            const answer = await media.start(session.stream, socket, decoded.offer)
            socket.send(JSON.stringify({ type: 'start', answer }))
          } catch (e) {
            return socket.send(JSON.stringify({ type: 'error', message: e }))
          }
        } break
        case 'stop':
          await media.stop(session.stream)
          break
        case 'candidate':
          await media.candidate(session.stream, decoded.candidate)
          break
        case 'motion': {

        } break
        default:
          socket.send(JSON.stringify({
            type: 'error',
            message: `invalid message type '${decoded.type}'`
          }))
          break
      }
    })
  })

  return router
}



// Start nuxt.js
async function start () {
  const app = websockify(new Koa())
  app.keys = ['omniamutantur']

  // Import and Set Nuxt.js options
  let config = require('../nuxt.config.js')
  config.dev = !(app.env === 'production')
  config.env = { host: HOST, ...config.env }

  // Instanciate nuxt.js
  const nuxt = await new Nuxt(config)
  // Build in development
  if (config.dev) {
    try {
      await nuxt.build()
    } catch (e) {
      console.error(e) // eslint-disable-line no-console
      process.exit(1)
    }
  }

  const keystore = new Keystore()

  const sessions = session({
    store: {
      async get (key, age, { rolling }) {
        return keystore.getMap(`session:${key}`)
      },
      async set (key, session, age, { rolling, changed }) {
        return keystore.setMap(`session:${key}`, session)
      },
      async destroy (key) {
        return keystore.destroy(`session:${key}`)
      }
    }
  }, app)

  
  app.use(body())
  app.use(async (ctx, next) => {
    await sessions(ctx, async () => {
      ctx.session.id = ctx.session.id || uuid()
    })

    await next()
  })
  
  app.use(async (ctx) => {
    ctx.status = 200
    await nuxt.render(ctx.req, ctx.res)
  })

  const routes = dispatch()
  app.ws.use(sessions)
  app.ws.use(routes.routes())

  app.listen(PORT, BIND)
  console.log('Server listening on ' + HOST) // eslint-disable-line no-console
}

start().catch(err => {
  console.error(err)
})
