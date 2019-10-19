const moduleAlias = require('module-alias/register')
const http = require('http')
const path = require('path')
const status = require('http-status')
const koaBody = require('koa-body')
const koaLogger = require('koa-logger')
const koaServe = require('koa-static')
const koaMount = require('koa-mount')
const koaRouter = require('koa-router')()
const koaCors = require('@koa/cors')
const Koa = require('koa')
const app = new Koa()
const utils = require('@utils')
const actions = require('@actions')
const db = require('@db')

app.context.db = db
app.context.response =
app.use(koaCors())
app.use(koaLogger())
app.use(koaBody({ includeUnparsed: true, multipart: true, urlencoded: true }))
app.use(utils.render({
  path: path.join(__dirname, 'views/'),
  ext: 'html',
  autoescape: true,
  cache: false,
  watch: true,
  writeResponse: true
}))

// Custom error handling & set token data to ctx if it present
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    ctx.status = err.status || status.INTERNAL_SERVER_ERROR
    ctx.app.emit('error', err, ctx)
    if (~ctx.request.get('Content-Type').indexOf('application/json')) {
      ctx.status = status.OK
      ctx.body = {
        code: err.status || status.INTERNAL_SERVER_ERROR,
        data: {},
        message: err.originalError ? err.originalError.message : err.message,
        errors: { stack: err.stack }
      }
    } else {
      ctx.throw(ctx.status)
    }
  }
})

// Error event listener
app.on('error', (err, ctx) => {
  console.error('Centralized Error Logging >>>', err, ctx)
})

// Serving static assets
app.use(koaMount('/statics', koaServe(__dirname + '/statics')))

// Routes definition
koaRouter.get('/', actions.index)
  .post('/sign-up', actions.signUp)
  .post('/sign-in', actions.signIn)
  .post('/sign-out', utils.isAuthenticated, actions.signOut)
  .post('/locate', utils.isAuthenticated, actions.locate)
  .post('/request', utils.isAuthenticated, actions.request)
  .post('/response', utils.isAuthenticated, actions.response)
  .post('/cancel', utils.isAuthenticated, actions.cancel)
  .post('/resolve', utils.isAuthenticated, actions.resolve)
  .post('/close', utils.isAuthenticated, actions.close)
  .post('/rate', utils.isAuthenticated, actions.rate)
  .get('/feed', utils.isAuthenticated, actions.feed)
  .get('/around/:userId*', actions.around)
  .post('/push', actions.push)
  .post('/device-token', utils.isAuthenticated, actions.deviceToken)
  .get('/entity/:entityId', actions.entity)
  .post('/reject', utils.isAuthenticated, actions.reject)
  .post('/free', utils.isAuthenticated, actions.free)

// Apply routes
app.use(koaRouter.routes())

// Create http server
http.createServer(app.callback()).listen(utils.env('PORT', 3000))
