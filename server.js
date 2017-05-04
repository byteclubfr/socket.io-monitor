'use strict'

const { createServer } = require('net')
const EventEmitter = require('events')
const debug = require('debug')('socket.io-monitor')


/**
 * Options:
 * - server: boolean = true (start server ? Otherwise just expose the emitter)
 * - port: number = 9042
 * - host: string = 'localhost'
 * - password: string? = null (server password)
 *
 * Output:
 * - emitter: EventEmitter
 * - server: Promise<net.Server>
 */
module.exports = (io, options = {}) => {
  const { server = true } = options

  const emitter = initEmitter(io, options)

  return server
    ? { emitter, server: initServer(emitter, options) }
    : { emitter }
}


const initServer = exports.initServer = (emitter, options) => new Promise((resolve, reject) => {
  const { port = 9042, host = 'localhost' } = options

  throw new Error('Not implemented yet')

  const server = createServer()

  server.listen(port, host)

  server.once('listening', () => {
    resolve(server)
    server.on('connection', connHandler(emitter))
  })

  server.once('error', err => reject(err))
})


const monkeyPatch = (object, method, fn) => {
  const orig = object[method]
  object[method] = function (...args) {
    fn.apply(this, args)
    return orig.apply(this, args)
  }
}


const initEmitter = exports.initEmitter = (io, options) => {
  const e = new EventEmitter();

  const adapter = io.adapter()

  // Monitor broadcasts
  monkeyPatch(adapter, 'broadcast', (packet, { rooms, flags }) => {
    e.emit('broadcast', { packet, rooms, flags })
  })

  // Monitor rooms
  monkeyPatch(adapter, 'add', (id, room) => {
    e.emit('join', { id, room })
  })
  monkeyPatch(adapter, 'del', (id, room) => {
    e.emit('leave', { id, room })
  })
  monkeyPatch(adapter, 'delAll', id => {
    e.emit('leaveAll', { id })
  })

  // Monitor connections
  io.on('connection', ws => {
    e.emit('connect', { id: ws.id })

    // Monitor disconnections
    ws.on('disconnect', () => e.emit('disconnect', { id: ws.id }))

    // Monitor messages client → server
    monkeyPatch(ws, 'emit', (name, ...args) => {
      e.emit('emit', { id: ws.id, name, args })
    })

    // Monitor messages server → client
    monkeyPatch(ws, 'dispatch', ([ name, ...args ]) => {
      e.emit('recv', { id: ws.id, name, args })
    })
  })

  // Debug (oh look, a synthetic list of all events you could use as documentation)
  if (debug.enabled) {
    e
    .on('broadcast', ({ packet, rooms, flags }) => debug('broadcast', rooms, packet))
    .on('join', ({ id, room }) => debug('join', id, room))
    .on('leave', ({ id, room }) => debug('leave', id, room))
    .on('leaveAll', ({ id }) => debug('leaveAll', id))
    .on('connect', ({ id }) => debug('connect', id))
    .on('disconnect', ({ id }) => debug('disconnect', id))
    .on('emit', ({ id, name, args }) => debug('emit', id, name))
    .on('recv', ({ id, name, args }) => debug('recv', id, name))
  }

  return e
}
