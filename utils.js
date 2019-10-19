const path = require('path')
const moment = require('moment')
const nunjucks = require('nunjucks')
const status = require('http-status')
const _ = require('lodash')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const cache = require('memory-cache')
const axios = require('axios')
const geolib = require('geolib')

const utils = {
  // Get environment variable function
  env: (e, d = '') => {
    if (typeof process.env[e] === 'undefined' || process.env[e] === '') return d
    return process.env[e]
  },
  // Get current time - UTC timezone
  nowUtc: () => {
    return moment().utc().format('YYYY-MM-DD HH:mm:ss') // Convert to UTC
  },
  // Get current time - Server Local timezone
  utcToLocal: (date) => {
    let dateUtc = moment.utc(date).toDate()
    return moment(dateUtc).local().format('YYYY-MM-DD HH:mm:ss') // Convert to Local
  },
  // Merge other object to this object
  merge: (object, other) => {
    return _.merge(object, other)
  },
  // Check object has property or not
  hasProperty: (object, path) => {
    return _.has(object, path)
  },
  // Filter array object
  filter: (array, predicate) => {
    return _.filter(array, predicate);
  },
  // Execute command
  execCommand: (command) => {
    return exec(command)
  },
  // Render nunjucks html template
  render: (opts) => {
    const defaultOpts = {
      path: path.join(__dirname, 'views/'),
      ext: 'html',
      autoescape: true,
      cache: false,
      watch: true,
      writeResponse: true
    }
    opts.ext = `.${opts.ext.replace(/^\./, '')}`
    const {path: viewPath, ...viewOpts} = _.merge(defaultOpts, opts)
    const nunEnv = nunjucks.configure(viewPath, viewOpts)
    return async function(ctx, next) {
      if (ctx.render) {
        return await next()
      }
      ctx.render = async (view, context) => {
        const mergedContext = _.merge({}, ctx.state, context)
        view += opts.ext
        html = nunEnv.render(view, mergedContext)
        if (opts.writeResponse) {
          ctx.type = 'html'
          ctx.body = html
        }
      }
      await next()
    }
  },
  cachePut: (key, value, time, timeoutCallback) => {
    return cache.put(key, value, time, timeoutCallback)
  },
  cacheGet: (key) => {
    return cache.get(key)
  },
  cacheDelete: (key) => {
    return cache.del(key)
  },
  verifyUser: async (ctx, userId) => {
    // Retrieve user from cache memory
    user = utils.cacheGet(userId)
    // If user existing in cache memory
    if (user !== null) return user
    let db = ctx.db
    // Get user from firestore database
    user = await db.users.find(userId)
    // Store user in cache memory
    utils.cachePut(userId, user)
    return user
  },
  // Check if user is authenticated
  isAuthenticated: async (ctx, next) => {
    if (!ctx.header || !ctx.header.authorization) {
      ctx.throw(status.UNAUTHORIZED, 'No authorization token in headers.')
    }
    const parts = ctx.headers.authorization.split(' ')
    if (parts.length === 2) {
      const scheme = parts[0]
      const credentials = parts[1]
      if (/^Bearer$/i.test(scheme)) {
        let user = await utils.verifyUser(ctx, credentials)
        if (user === null) {
          ctx.throw(status.UNAUTHORIZED, 'Invalid authorization token request.')
        }
        ctx.authorization_token = credentials
        ctx.user = user
        await next()
        return
      }
    }
    ctx.throw(status.UNAUTHORIZED, 'Bad Authorization header format. Format is "Authorization: Bearer <token>"')
  },
  // Calculates the distance between two geo coordinates. Unit: meter
  // @param { latitude: int, longitude: int} point.
  getDistance: (from, to) => {
    return geolib.getDistance(from, to)
  },
  isEmpty: (value) => {
    return _.isEmpty(value)
  },
  isUndefined: (value) => {
    return _.isUndefined(value)
  },
  sleep: (ms) => {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
  },
  pushNotification: async (db, users, notification, data) => {
    if (users instanceof Array) {
      users.forEach(async (user) => {
        if (user.deviceToken) {
          await db.push(user.deviceToken, notification, data)
        }
      })
    }
  },
  buildRequestMessageNotification: (title, body) => {
    if (_.isEmpty(title) || _.isUndefined(title)) {
      title = 'Giúp tôi'
    }
    if (_.isEmpty(body) || _.isUndefined(body)) {
      body = 'Hãy giúp tôi ngay lập tức'
    }
    return { title, body }
  },
  buildResponseMessageNotification: (title, body) => {
    if (_.isEmpty(body) || _.isUndefined(body)) {
      body = 'Đợi vài phút, tôi có thể giúp bạn'
    }
    return { title, body }
  },
  buildRequestMessageData: (data) => {
    if (_.isUndefined(data) || _.isEmpty(data)) {
      return {}
    }
    return { entityId: data.entity.id, phone: data.entity.from.phone, latitude: `${data.entity.location.latitude}`, longitude: `${data.entity.location.longitude}` }
  },
  buildResponseMessageData: (entity, toUser) => {
    if (_.isUndefined(entity) || _.isEmpty(entity)) {
      return {}
    }
    return { entityId: entity, latitude: `${toUser.location.latitude}`, longitude: `${toUser.location.longitude}` }
  },
}

module.exports = utils
