const moduleAlias = require('module-alias/register')
const path = require('path')
const admin = require('firebase-admin')
const utils = require('@utils')
const serviceAccount = require(path.join(__dirname, 'credentials/service-account.json'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://alibaba-f38e2.firebaseio.com'
})

const db = admin.firestore()
const ms = admin.messaging()
const usersRef = db.collection('users')
const entitiesRef = db.collection('entities')

const dbObject = {
  timestamp: (record, isCreateNew = true) => {
    let createdAt = updatedAt = utils.nowUtc()
    // If create new record
    if (isCreateNew) return utils.merge(record, { createdAt, updatedAt })
    // If update existing record
    return utils.merge(record, { updatedAt })
  },
  truncate: async (collectionRef, batchSize = 50) => {
    let query = collectionRef.orderBy('__name__').limit(batchSize)
    return dbObject.truncateBatch(query, batchSize)
  },
  truncateBatch: async (query, batchSize) => {
    try {
      let snapshot = await query.get()
      if (snapshot.size == 0) {
        return 0
      }
      let batch = db.batch()
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })
      let numDeleted = await batch.commit()
      if (numDeleted === 0) {
        return true
      }
      process.nextTick(async () => {
        await dbObject.truncateBatch(query, batchSize)
      })
    } catch (err) {
      return false
    }
  },
  push: async (token, notification, data) => {
    let payload = { token }
    if (!utils.isUndefined(notification) && !utils.isEmpty(notification))
      payload = utils.merge(payload, { notification })
    if (!utils.isUndefined(data) && !utils.isEmpty(data))
      payload = utils.merge(payload, { data })
    try {
      let response = await ms.send(payload)
      // Response is a message ID string.
      console.log('[Notification] Successfully sent payload:', response);
    } catch(err) {
      // Just print only error.
      console.log('[Notification] Error sending payload:', err);
    }
  },
  users: {
    insert: async (users) => {
      // If insert data is array object
      if (users instanceof Array) {
        let batch = db.batch()
        users.forEach((user) => {
          let docRef = usersRef.doc()
          user = dbObject.timestamp(user)
          batch.set(docRef, user)
        })
        return batch.commit()
      }
      // If insert data is single object
      users = dbObject.timestamp(users)
      return usersRef.add(users)
    },
    update: async (id, data) => {
      if (typeof id !== 'string') throw new Error('Id must be string')
      let userRef = usersRef.doc(id)
      let user = await userRef.get()
      if (user.exists) {
        data = dbObject.timestamp(data, false)
        return userRef.update(data)
      }
      return false
    },
    updateBatchUserId: async (users) => {
      let batch = db.batch()
      users.forEach((user) => {
        let docRef = usersRef.doc(user.id)
        user = dbObject.timestamp(user)
        user.userId = user.id
        batch.update(docRef, user)
      })
      return batch.commit()
    },
    truncate: async () => {
      return dbObject.truncate(usersRef)
    },
    all: async () => {
      let users = await usersRef.get()
      let result = []
      for (user of users.docs) {
        user = utils.merge(user.data(), { id: user.id })
        result.push(user)
      }
      return result
    },
    find: async (id) => {
      if (typeof id !== 'string') throw new Error('Id must be string')
      // Find user by id
      let user = await usersRef.doc(id).get()
      if (user.exists) {
        return user.data()
      }
      return null
    },
    findBy: async (key, value) => {
      // File all users by `key` such as name/email
      let users = await usersRef.where(`${key}`, '==', value).get()
      let result = []
      for (user of users.docs) {
        user = utils.merge(user.data(), { id: user.id })
        result.push(user)
      }
      return result
    }
  },
  entities: {
    insert: async (entities) => {
      // If insert data is array object
      if (entities instanceof Array) {
        let batch = db.batch()
        entities.forEach((entity) => {
          let docRef = entitiesRef.doc()
          entity = dbObject.timestamp(entity)
          batch.set(docRef, entity)
        })
        return batch.commit()
      }
      // If insert data is single object
      entities = dbObject.timestamp(entities)
      return entitiesRef.add(entities)
    },
    update: async (id, data) => {
      if (typeof id !== 'string') throw new Error('Id must be string')
      let entityRef = entitiesRef.doc(id)
      let entity = await entityRef.get()
      if (entity.exists) {
        data = dbObject.timestamp(data, false)
        return entityRef.update(data)
      }
      return false
    },
    truncate: async () => {
      return dbObject.truncate(entitiesRef)
    },
    all: async () => {
      let entities = await entitiesRef.get()
      let result = []
      for (entity of entities.docs) {
        entity = utils.merge(entity.data(), { id: entity.id })
        result.push(entity)
      }
      return result
    },
    find: async (id) => {
      if (typeof id !== 'string') throw new Error('Id must be string')
      // Find entity by id
      let entity = await entitiesRef.doc(id).get()
      if (entity.exists) {
        return entity.data()
      }
      return null
    },
    findBy: async (key, value) => {
      // File all entities by `key` such as name/email
      let entities = await entitiesRef.where(`${key}`, '==', value).get()
      let result = []
      for (entity of entities.docs) {
        entity = utils.merge(entity.data(), { id: entity.id })
        result.push(entity)
      }
      return result
    },
    addUser: async (id, data) => {
      let entityUsersRef = entitiesRef.doc(id).collection('users')
      return entityUsersRef.add(data)
    },
    deleteUser: async (entityId, userId) => {
      return entitiesRef.doc(entityId).collection('users').doc(userId).delete()
    },
    allUsers: async (id) => {
      let entityUsers = await entitiesRef.doc(id).collection('users').get()
      let result = []
      for (user of entityUsers.docs) {
        user = utils.merge(user.data(), { id: user.id })
        result.push(user)
      }
      return result
    },
    allUsersCollection: async (id) => {
      let entityUsers = await entitiesRef.doc(id).collection('users').get()
      let result = []
      for (user of entityUsers.docs) {
        result.push(user)
      }
      return result
    }
  }
}

module.exports = dbObject
