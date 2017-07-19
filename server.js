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

  const emitter = initEmitter(io)

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


const initEmitter = exports.initEmitter = (io) => {
  const e = new EventEmitter()

  const { adapter } = io.sockets

  // Monitor broadcasts
  monkeyPatch(adapter, 'broadcast', (packet, { rooms = [], flags = {} }) => {
    if (packet.type === 2) {
      const [ name, ...args ] = packet.data
      const flagsList = Object.keys(flags).filter(f => flags[f])
      e.emit('broadcast', { name, args, rooms, flags: flagsList })
    }
  })

  // Monitor rooms
  monkeyPatch(adapter, 'addAll', (id, rooms) => {
    if (rooms.length > 1 || !rooms.includes(id)) {
      e.emit('join', { id, rooms })
    }
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
      if (typeof args[args.length - 1] === 'function') {
        args.pop()
      }
      e.emit('emit', { id: ws.id, name, args })
    })

    // Monitor messages server → client
    monkeyPatch(ws, 'dispatch', ([ name, ...args ]) => {
      if (typeof args[args.length - 1] === 'function') {
        args.pop()
      }
      e.emit('recv', { id: ws.id, name, args })
    })
  })

  e.getState = () => getState(io)

  // Debug (oh look, a synthetic list of all events you could use as documentation)
  if (debug.enabled) {
    e
    .on('string', ({ id, string }) => debug('string', id, string))
    .on('broadcast', ({ name, args, rooms, flags }) => debug('broadcast', name, args, rooms, flags))
    .on('join', ({ id, rooms }) => debug('join', id, rooms))
    .on('leave', ({ id, room }) => debug('leave', id, room))
    .on('leaveAll', ({ id }) => debug('leaveAll', id))
    .on('connect', ({ id }) => debug('connect', id))
    .on('disconnect', ({ id }) => debug('disconnect', id))
    .on('emit', ({ id, name, args }) => debug('emit', id, name, args))
    .on('recv', ({ id, name, args }) => debug('recv', id, name, args))
  }

  return e
}

const noop = () => {}

const connHandler = (emitter, options) => {
  const { password = null, authTimeout = 1500, onError = noop } = options

  // Store list of all bound protocols, avoids memory leak by binding too many handlers
  let protos = []
  const addProto = proto => {
    protos = protos.concat([ proto ])
    setImmediate(() => {
      emitter.getState()
      .then(data => {
        proto.emit('init', data)
        setImmediate(() => emitter.emit('client', { client: proto, state: data }))
      })
      .catch(err => proto.emit('error', err.message))
    })
  }
  const removeProto = proto => {
    protos = protos.filter(p => p !== proto)
    proto.removeAllListeners()
  }
  const dispatch = name => data => {
    protos.forEach(proto => proto.emit(name, data))
  }

  // Retransmit events
  emitter
  .on('string', dispatch('string'))
  .on('broadcast', dispatch('broadcast'))
  .on('join', dispatch('join'))
  .on('leave', dispatch('leave'))
  .on('leaveAll', dispatch('leaveAll'))
  .on('connect', dispatch('connect'))
  .on('disconnect', dispatch('disconnect'))
  .on('emit', dispatch('emit'))
  .on('recv', dispatch('recv'))

  return socket => {
    socket.on('error', err => debug('socket error', err))
    socket.on('error', onError)

    const proto = protocol.bindSocket(socket)

    socket.on('close', () => removeProto(proto))

    let authorized = false

    // Plug TCP socket to local emitter
    const init = () => {
      authorized = true
      addProto(proto)
    }

    // Authentication
    let timeout = null
    if (!password) {
      proto.emit('reqAuth', false)
      // Wait for an empty password though, to ensure roundtrip is complete
      proto.once('password', () => init())
    } else {
      proto.emit('reqAuth', true)
      // Auth timeout
      const timeout = setTimeout(() => {
        proto.emit('auth', { authorized: false, error: 'TIMEOUT' })
        socket.end()
      }, authTimeout)
      proto.once('password', pwd => {
        clearTimeout(timeout)
        if (pwd === password) {
          proto.emit('auth', { authorized: true })
          init()
        } else {
          proto.emit('auth', { authorized: false, error: 'INVALID_PASSWORD' })
          socket.end()
        }
      })
    }
  }
}


// Grab rooms & sockets data
const getState = io => Promise.resolve().then(() => {
  // Aggregate data from rooms
  const forEachRoom = (fn, initial) =>
    Object.keys(io.sockets.adapter.rooms).reduce((data, name) => {
      const info = io.sockets.adapter.rooms[name]
      const sockets = Object.entries(io.sockets.sockets)
        .map(([id, socket]) => ({ id, connectedAt: socket.handshake.issued }))
        .filter(({ id }) => info.sockets[id] && io.sockets.sockets[id])

      return fn(data, sockets, name)
    }, initial)

  // rooms: Array<{ name: string, sockets: Array<string> }>
  const rooms = forEachRoom((rooms, sockets, name) => {
    if (sockets.length === 1 && sockets[0].id === name) {
      // A personal room, just skip it
      return rooms
    }
    rooms.push({ name, sockets: sockets.map(s => s.id) })
    return rooms
  }, [])

  // sockets: Array<{ id: string, connectedAt: number }>
  const sockets = forEachRoom((arr, sockets) => {
    // unique
    sockets.forEach(s => {
      if (!arr.find(({ id }) => s.id === id)) arr.push(s)
    })
    return arr
  }, [])

  return { rooms, sockets }
})
