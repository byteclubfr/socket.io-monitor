'use strict'

const EventEmitter = require('events')
const { expect } = require('chai')
const { Server } = require('net')
const http = require('http')
const socketio = require('socket.io')
const socketioClient = require('socket.io-client')
const monitor = require('../')


describe('Socket.io Monitor', () => {

  let ioServer, ioUrl

  // Start socket.io server
  before(() => new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0)
    ioServer = socketio.listen(server)
    server.on('listening', () => {
      ioUrl = 'ws://localhost:' + server.address().port
      resolve()
    })
    server.on('error', reject)
  }))

  describe('Monitor: Emitter only', () => {

    let ioClient, ioClientId, emitter, socket

    it('should init Monitor emitter', () => {
      const result = monitor.bind(ioServer, { server: false, port: 0 })
      expect(result).to.be.an('object')
      expect(result).to.have.property('server', null)
      expect(result).to.have.property('emitter').instanceOf(EventEmitter)
      emitter = result.emitter
    })

    it('should expose io state', () => {
      expect(emitter).to.have.property('getState').to.be.a('function')
      const state = emitter.getState()
      expect(state).to.be.instanceOf(Promise)
      return state.then(data => {
        expect(data).to.have.property('rooms').to.be.an('array')
        expect(data).to.have.property('sockets').to.be.an('array')
      })
    })

    it('should watch: ws connection', cb => {
      ioClient = socketioClient(ioUrl)
      emitter.once('connect', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        ioClientId = data.id
        cb()
      })
    })

    it('should watch: ws disconnection', cb => {
      ioClient.disconnect()
      emitter.once('disconnect', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string').to.equal(ioClientId)
        ioClientId = null
        cb()
      })
    })

    it('should watch: room join', cb => {
      ioServer.once('connection', _socket => {
        socket = _socket
        setImmediate(() => socket.join('room1'))
      })
      emitter.once('connect', data => {
        ioClientId = data.id
      })
      ioClient = socketioClient(ioUrl)
      // Socket joins his own room: this is skipped
      // Then he joins the specific ones
      emitter.once('join', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('rooms').to.eql([ 'room1' ])
        cb()
      })
    })

    it('should watch: room leave', cb => {
      socket.on('goodbye', () => {
        setImmediate(() => socket.leave('room1'))
      })

      ioClient.emit('goodbye')

      emitter.once('leave', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('room').to.equal('room1')
        cb()
      })
    })

    it('should watch: room leaveAll', cb => {
      socket.on('ghost', () => {
        setImmediate(() => {
          socket.join('room1')
          socket.join('room2')
          socket.leaveAll()
        })
      })

      ioClient.emit('ghost')

      emitter.once('leaveAll', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string').to.equal(ioClientId)
        cb()
      })
    })

    it('should watch: broadcast', cb => {
      const ioClient2 = socketioClient(ioUrl)
      ioClient2.on('connect', () => {
        ioServer.volatile.to('room2').emit('globalevent', 1, false)
      })
      emitter.once('broadcast', data => {
        expect(data).to.be.an('object')
        expect(data).to.have.property('name').to.equal('globalevent')
        expect(data).to.have.property('flags').to.eql([ 'volatile' ])
        expect(data).to.have.property('rooms').to.eql([ 'room2' ])
        expect(data).to.have.property('args').to.eql([ 1, false ])
        cb()
      })
    })

    it('should watch: recv', cb => {
      ioClient.emit('hello', 'age', 42)

      emitter.once('recv', data => {
        expect(data).to.be.an('object')
        expect(data).to.have.property('id').to.be.a('string').to.equal(ioClientId)
        expect(data).to.have.property('name').to.be.a('string').to.equal('hello')
        expect(data).to.have.property('args').to.eql([ 'age', 42 ])
        cb()
      })
    })

  })

  describe('Monitor: client/server', () => {

    let ioClient, ioClientId, port, client, promiseOfInit, socket

    it('should init Monitor emitter & server', () => {
      const result = monitor.bind(ioServer, { server: true, port: 0 })
      expect(result).to.be.an('object')
      expect(result).to.have.property('server').instanceOf(Promise)
      expect(result).to.have.property('emitter').instanceOf(EventEmitter)
      return result.server.then(s => port = s.address().port)
    })

    it('should not send password on passwordless server', () =>
      monitor.connect({ port, password: 'toto' }).then(
        // Success → test failed
        () => Promise.reject(Error('Expected PASSWORD_UNEXPECTED error')),
        // Error → test succeeded
        err => expect(err).to.be.instanceOf(Error).have.property('message', 'PASSWORD_UNEXPECTED')
      )
    )

    it('should init Monitor client', () => {
      const conn = monitor.connect({ port })
      expect(conn).to.be.instanceOf(Promise)
      return conn.then(c => {
        client = c
        // Watch 'init' event
        promiseOfInit = new Promise(resolve => c.once('init', resolve))
      })
    })

    it('should receive initial state', () => promiseOfInit.then(data => {
      expect(data).to.be.an('object')
      expect(data).to.have.property('rooms').to.be.an('array')
      expect(data).to.have.property('sockets').to.be.an('array')
    }))

    it('should watch: ws connection', cb => {
      ioClient = socketioClient(ioUrl)
      client.once('connect', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        ioClientId = data.id
        cb()
      })
    })

    it('should watch: ws disconnection', cb => {
      ioClient.disconnect()
      client.once('disconnect', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string').to.equal(ioClientId)
        cb()
      })
    })

    it('should watch: room join', cb => {
      ioServer.once('connection', _socket => {
        socket = _socket
        setImmediate(() => socket.join('room1'))
      })
      client.once('connect', data => {
        ioClientId = data.id
      })
      ioClient = socketioClient(ioUrl)
      // Socket joins his own room: this is skipped
      // Then he joins the specific ones
      client.once('join', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('rooms').to.eql([ 'room1' ])
        cb()
      })
    })

    it('should watch: room leave', cb => {
      socket.on('goodbye', () => {
        setImmediate(() => socket.leave('room1'))
      })

      ioClient.emit('goodbye')

      client.once('leave', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('room').to.equal('room1')
        cb()
      })
    })

    it('should watch: room leaveAll', cb => {
      socket.on('ghost', () => {
        setImmediate(() => {
          socket.join('room1')
          socket.join('room2')
          socket.leaveAll()
        })
      })

      ioClient.emit('ghost')

      client.once('leaveAll', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string').to.equal(ioClientId)
        cb()
      })
    })

    it('should watch: recv', cb => {
      ioClient.emit('hello', 'age', 42)

      client.once('recv', data => {
        expect(data).to.be.an('object')
        expect(data).to.have.property('id').to.be.a('string').to.equal(ioClientId)
        expect(data).to.have.property('name').to.be.a('string').to.equal('hello')
        expect(data).to.have.property('args').to.eql([ 'age', 42 ])
        cb()
      })
    })

  })

  describe('Monitor: client/server with password', () => {

    let port, promiseOfInit

    it('should init Monitor server with password', () => {
      const result = monitor.bind(ioServer, { server: true, port: 0, password: 'toto' })
      return result.server.then(s => port = s.address().port)
    })

    it('should fail connect() without password', () =>
      monitor.connect({ port }).then(
        () => Promise.reject(Error('Expected auth error PASSWORD_REQUIRED')),
        er => expect(er).property('message', 'PASSWORD_REQUIRED')
      )
    )

    it('should fail connect() with invalid password', () =>
      monitor.connect({ port, password: 'tata' }).then(
        () => Promise.reject(Error('Expected auth error INVALID_PASSWORD')),
        er => expect(er).property('message', 'INVALID_PASSWORD')
      )
    )

    it('should connect() with valid password', () =>
      monitor.connect({ port, password: 'toto' }).then(c => {
        promiseOfInit = new Promise(resolve => c.once('init', resolve))
      })
    )

    it('should receive initial state', () => promiseOfInit.then(data => {
      expect(data).to.be.an('object')
      expect(data).to.have.property('rooms').to.be.an('array')
      expect(data).to.have.property('sockets').to.be.an('array')
    }))

  })

})
