'use strict'

const { createServer } = require('net')
const EventEmitter = require('events')
const debug = require('debug')('socket.io-monitor')
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
    if (password) {
      proto.emit('password', password)
      proto.once('auth', ({ authorized, error }) => {
        if (authorized) {
          resolve(proto)
        } else {
          reject(new Error(error))
        }
      })
    } else {
      resolve(proto)
    }
  })

  socket.once('error', err => reject(err))
})
