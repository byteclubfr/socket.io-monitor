'use strict'

const { createConnection } = require('net')
const protocol = require('./protocol')


/**
 * Options:
 * - port: number = 9042
 * - host: string = 'localhost'
 * - password: string? = null (server password)
 *
 * Output: Promise<EventEmitter>
 */
module.exports = (options = {}) => new Promise((resolve, reject) => {
  const { port = 9042, host = 'localhost', password = null } = options

  const socket = createConnection(port, host)

  socket.once('connect', () => {
    const proto = protocol.bindSocket(socket)
    proto.once('reqAuth', authRequired => {
      if (authRequired && !password) {
        reject(new Error('PASSWORD_REQUIRED'))
      } else if (!authRequired && password) {
        reject(new Error('PASSWORD_UNEXPECTED'))
      } else if (authRequired && password) {
        proto.emit('password', password)
        proto.once('auth', ({ authorized, error }) => {
          if (authorized) {
            resolve(proto)
          } else {
            reject(new Error(error))
          }
        })
      } else {
        // Server still expects an empty password to init events
        proto.emit('password', '')
        resolve(proto)
      }
    })
  })

  socket.once('error', err => reject(err))
})
