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

    let ioClient, ioClientId, emitter

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
      expect(state).to.be.an('object')
      expect(state).to.have.property('rooms').to.be.an('array')
      expect(state).to.have.property('connections').to.be.an('array')
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
        cb()
      })
    })

    it('should watch: room', cb => {
      ioServer.once('connection', socket => {
        setImmediate(() => socket.join('room1'))
      })
      ioClient = socketioClient(ioUrl)
      // Socket joins his own room: this is skipped
      // Then he joins the specific ones
      emitter.once('join', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('room').to.equal('room1')
        cb()
      })
    })

  })

  describe('Monitor: client/server', () => {

    let ioClient, ioClientId, port, client, promiseOfInit

    it('should init Monitor emitter & server', () => {
      const result = monitor.bind(ioServer, { server: true, port: 0 })
      expect(result).to.be.an('object')
      expect(result).to.have.property('server').instanceOf(Promise)
      expect(result).to.have.property('emitter').instanceOf(EventEmitter)
      return result.server.then(s => port = s.address().port)
    })

    it('should init Monitor client', () => {
      const conn = monitor.connect({ port })
      expect(conn).to.be.instanceOf(Promise)
      return conn.then(c => {
        client = c
        // Watch 'init' event
        promiseOfInit = new Promise(resolve => client.on('init', resolve))
      })
    })

    it('should receive initial state', () => promiseOfInit.then(data => {
      expect(data).to.be.an('object')
      expect(data).to.have.property('rooms').to.be.an('array')
      expect(data).to.have.property('connections').to.be.an('array')
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

    it('should watch: room', cb => {
      ioServer.once('connection', socket => {
        setImmediate(() => socket.join('room1'))
      })
      ioClient = socketioClient(ioUrl)
      // Socket joins his own room: this is skipped
      // Then he joins the specific ones
      client.once('join', data => {
        expect(data).to.be.an('object').to.have.property('id').to.be.a('string')
        expect(data).to.have.property('room').to.equal('room1')
        cb()
      })
    })

  })

})
