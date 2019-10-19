const fs = require('fs')
const path = require('path')
const status = require('http-status')
const _ = require('lodash')
const utils = require('@utils')
const db = require('@db')

const ENTITY_STATUS = { NEW: 0, INPROGRESS: 1, RESOLVED: 2, CLOSED: 3, CANCEL: 4 }
const FREE_STATUS = { NO: 0, YES: 1 }

const wrapJson = (ctx, code, data = {}, message = '', errors = []) => {
  ctx.status = status.OK
  ctx.body = { code, data, message, errors }
  return true
}

const wrapJsonError = (ctx, err, code = status.INTERNAL_SERVER_ERROR) => {
  let message = err.originalError ? err.originalError.message : err.message
  return wrapJson(ctx, code, {}, message, { stack: err.stack })
}

const actions = {
  index: async (ctx) => {
    let version = ''
    try {
      version = fs.readFileSync('version.txt').toString()
    } catch (err) {
      const { stdout, stderr } = await utils.execCommand(`cd ${__dirname} && git rev-parse HEAD`)
      version = stdout
    }
    ctx.render('index', { version })
  },
  signUp: async (ctx) => {
    let { name, email, gender } = ctx.request.body
    try {
      let users = await db.users.findBy('email', email)
      if (users.length) {
        return wrapJson(ctx, status.BAD_REQUEST, {}, 'The email has already been taken')
      }
      let user = await db.users.insert({ name, email, gender })
      let result = await user.get()
      return wrapJson(ctx, status.OK, { user: { id: user.id, useId: user.id, ...result.data() } }, 'Sign up successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  signIn: async (ctx) => {
    let { email, password } = ctx.request.body
    try {
      let user = await db.users.findBy('email', email)
      if (!user.length) {
        return wrapJson(ctx, status.UNAUTHORIZED, {}, 'Username or password is incorrect')
      }
      wrapJson(ctx, status.OK, { user: { userId: user[0].id, ...user[0] } }, 'Sign in successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  signOut: async (ctx) => {
    let userId = ctx.authorization_token
    utils.cacheDelete(userId)
    wrapJson(ctx, status.OK, {}, 'Sign out successfully')
  },
  locate: async (ctx) => {
    let userId = ctx.authorization_token
    let { latitude, longitude } = ctx.request.body
    let location = { latitude, longitude }
    try {
      let result = await db.users.update(userId, { location })
      if (result === false) {
        return wrapJson(ctx, status.NOT_FOUND, {}, 'Could not update user location')
      }
      wrapJson(ctx, status.OK, {}, 'Update user location successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  request: async (ctx) => {
    let userId = ctx.authorization_token
    let { latitude, longitude, content } = ctx.request.body
    let location = { latitude, longitude }
    try {
      // Get all users except user has (id == userId) in database
      let users = await db.users.all()
      from = _.remove(users, { 'id': userId })
      // Find to check request user is existing or not
      if (from.length === 0) {
        throw new Error('Request user is not existing')
      }
      from = from[0]
      from.userId = userId
      // Create new entity
      let entity = await db.entities.insert({
        from: from,
        status: ENTITY_STATUS.NEW,
        location: location,
      })
      // Get data of this entity
      entity = await entity.get()
      let data = {
        entity: { id: entity.id, ...entity.data() }
      }
      // Filter free user
      // users = _.filter(users, function(user) {
      //   return user.free === FREE_STATUS.YES; 
      // });
      // If not exist any available user
      if (!users.length) {
        return wrapJson(ctx, status.OK, data, 'Requested failed! Not exist any free users')
      }

      // Perform push notification to all request users
      utils.pushNotification(
        db,
        users,
        utils.buildRequestMessageNotification('Tôi là ' + from.name, content),
        utils.buildRequestMessageData(data)
      )
      wrapJson(ctx, status.OK, data, 'Requested successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  cancel: async (ctx) => {
    let userId = ctx.authorization_token
    let { entityId } = ctx.request.body
    try {
      // Find to check entity is existing or not
      let entity = await db.entities.find(entityId)

      if (entity === null) {
        throw new Error('Entity is not existing')
      }
      if (userId === entity.from.userId) {
        db.entities.update(entityId, { status: ENTITY_STATUS.CANCEL })
        return wrapJson(ctx, status.OK, {}, 'Request cancelled successfully')
      }
      // Retrieve the list of help user and delete user cancel
      let helper = await db.entities.allUsers(entityId)
      helper.forEach( async (user) => {
        if (user.userId === userId) {
          await db.entities.deleteUser(entityId, user.id)
        }
      })
      // Update status of this entity to cancel
      wrapJson(ctx, status.OK, {}, 'Response cancelled successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  response: async (ctx) => {
    let userId = ctx.authorization_token
    let { entityId, accept } = ctx.request.body
    if (accept === false || accept === 'false') {
      return wrapJson(ctx, status.OK, {}, 'Decline successfully')
    }
    try {
      // Find to check entity is existing or not
      let entity = await db.entities.find(entityId)
      if (entity === null) {
        throw new Error('Entity is not existing')
      }
      // Update status of this entity to inprogress
      await db.entities.update(entityId, {
        status: ENTITY_STATUS.INPROGRESS,
      })
      // Try to get recently update data
      entity = await db.entities.find(entityId)
      // Find to check response user is existing or not
      let to = await db.users.find(userId)
      if (to === null) {
        throw new Error('Response user is not existing')
      }
      // Assign attribute userId to user object
      to.userId = userId
      await db.users.update(to.id, {
        free: FREE_STATUS.NO
      })
      // Let find all related users
      let users = await db.entities.allUsers(entityId)
      // If user has already responsed
      if (utils.filter(users, { userId }).length) {
        throw new Error('User has already responsed')
      }
      // Add user into entities's users collection
      await db.entities.addUser(entityId, to)
      users.push(to)
      // Make return data
      let data = {
        entity: { ...entity, users }
      }
      // Perform push notification to request user
      utils.pushNotification(
        db,
        [entity.from],
        utils.buildResponseMessageNotification(`${to.name} Sẽ giúp bạn`, 'Vui lòng đợi vài phút để tôi đến'),
        utils.buildResponseMessageData(entityId, to)
      )
      wrapJson(ctx, status.OK, data, 'Responsed successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  resolve: async (ctx) => {
    let { entityId } = ctx.request.body
    try {
      // Find to check entity is existing or not
      let entity = await db.entities.find(entityId)
      if (entity === null) {
        throw new Error('Entity is not existing')
      }
      // Update status of this entity to resolved
      db.entities.update(entityId, { status: ENTITY_STATUS.RESOLVED })
      wrapJson(ctx, status.OK, {}, 'Resolved successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  close: async (ctx) => {
    let { entityId } = ctx.request.body
    try {
      // Find to check entity is existing or not
      let entity = await db.entities.find(entityId)
      if (entity === null) {
        throw new Error('Entity is not existing')
      }
      // Update status of this entity to resolved
      db.entities.update(entityId, { status: ENTITY_STATUS.CLOSED })
      wrapJson(ctx, status.OK, {}, 'Closed successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  rate: async (ctx) => {
    let params = ctx.request.body
    wrapJson(ctx, status.OK, {}, 'Rate successfully')
  },
  feed: async (ctx) => {
    let params = ctx.request.body
    wrapJson(ctx, status.OK, {}, 'Feed retrieve successfully')
  },
  around: async (ctx) => {
    try {
      let userId = ctx.params.userId
      if (userId === '' || typeof userId === 'undefined') {
        throw new Error('Please pass user id as url parameter')
      }
      let users = await db.users.all()
      // Get from user and remove it in array users
      fromUser = _.remove(users, { 'id': userId })
      // If user is not existing
      if (!fromUser.length) throw new Error('User id not found')
      // Return first match user id
      fromUser = fromUser[0]
      // Calculate distance between from user and other users
      users.map(user => {
        if (user.id === userId) return null
        user.distance = utils.getDistance(fromUser.location, user.location)
        return user
      })
      return ctx.render('around', { fromUser, users })
    } catch (err) {
      let message = err.originalError ? err.originalError.message : err.message
      return ctx.render('around', { message })
    }
  },
  push: async (ctx) => {
    let { token, data, notification } = ctx.request.body
    await db.push(token, notification, data)
    wrapJson(ctx, status.OK, {}, 'Push successfully')
  },
  deviceToken: async (ctx) => {
    let userId = ctx.authorization_token
    let { device_token } = ctx.request.body
    try {
      let result = await db.users.update(userId, { deviceToken: device_token })
      if (result === false) {
        return wrapJson(ctx, status.NOT_FOUND, {}, 'Could not update user device token')
      }
      wrapJson(ctx, status.OK, {}, 'Update user location successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  entity: async (ctx) => {
    try {
      let entityId = ctx.params.entityId
      if (utils.isEmpty(entityId) || utils.isUndefined(entityId)) {
        throw new Error('Please pass entity id as url parameter')
      }
      let entity = await db.entities.find(entityId)
      let users = await db.entities.allUsers(entityId)
      wrapJson(ctx, status.OK, { users: users, status: entity.status }, 'Get detail successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  reject: async (ctx) => {
    let userId = ctx.authorization_token
    let { entityId } = ctx.request.body
    try {
      let helper = await db.entities.allUsers(entityId)
      helper.forEach( async (user) => {
        if (user.userId === userId) {
          await db.entities.deleteUser(entityId, user.id)
        }
      })
      wrapJson(ctx, status.OK, {}, 'Reject helper successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  },
  free: async (ctx) => {
    let userId = ctx.authorization_token
    let { free } = ctx.request.body
    free = +free
    try {
      let result = await db.users.update(userId, { free })
      if (result === false) {
        return wrapJson(ctx, status.NOT_FOUND, {}, 'Could not update user free')
      }
      wrapJson(ctx, status.OK, {}, 'Update user free successfully')
    } catch (err) {
      wrapJsonError(ctx, err)
    }
  }
}

module.exports = actions
