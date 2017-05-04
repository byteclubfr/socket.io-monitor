'use strict'

const { createServer } = require('net')
const EventEmitter = require('events')
const debug = require('debug')('socket.io-monitor')
const protocol = require('./protocol')


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
    : { emitter, server: null }
}


const initServer = exports.initServer = (emitter, options = {}) => new Promise((resolve, reject) => {
  const { port = 9042, host = 'localhost' } = options

  const server = createServer()

  server.listen(port, host)

  server.once('listening', () => {
    resolve(server)
    server.on('connection', connHandler(emitter, options))
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


const initEmitter = exports.initEmitter = (io, options = {}) => {
  const e = new EventEmitter();

  const adapter = io.sockets.adapter

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

  e.getState = () => getInitialState(io)

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


const connHandler = (emitter, options) => socket => {
  const { password = null } = options

  const proto = protocol.bindSocket(socket)

  // Plug TCP socket to local emitter
  const init = () => {
    authorized = true
    setImmediate(() => proto.emit('init', emitter.getState()))
    // Retransmit events
    emitter
    .on('broadcast', data => proto.emit('broadcast', data))
    .on('join', data => proto.emit('join', data))
    .on('leave', data => proto.emit('leave', data))
    .on('leaveAll', data => proto.emit('leaveAll', data))
    .on('connect', data => proto.emit('connect', data))
    .on('disconnect', data => proto.emit('disconnect', data))
    .on('emit', data => proto.emit('emit', data))
    .on('recv', data => proto.emit('recv', data))
  }

  // Authentication
  let authorized = false
  if (!password) {
    init()
  }
  proto.on('password', pwd => {
    if (authorized) {
      proto.emit('auth', { authorized: false, error: 'NO_PASSWORD' })
      socket.emit('error', new Error('Received unexpected password'))
    } else if (pwd === password) {
      proto.emit('auth', { authorized: true })
      init()
    } else {
      proto.emit('auth', { authorized: false, error: 'INVALID_PASSWORD' })
      socket.emit('error', new Error('Invalid password'))
    }
  })
}


// TODO
const getInitialState = io => ({
  rooms: [],
  connections: []
})
