'use strict'

const EventEmitter = require('events')
const debug = require('debug')('socket.io-monitor:protocol')
const { parse, stringify } = require('./parser')


const END_OF_MESSAGE = new Buffer('~~~')


exports.bindSocket = socket => {
  const e = new EventEmitter
  const emit = e.emit.bind(e)
  const read = readMessage(emit)

  // Receive message = emit to local event emitter
  let buffer = new Buffer('')
  socket.on('data', chunk => {
    buffer = read(Buffer.concat([buffer, chunk]))
  })

  // Emit message = send to remote socket
  e.emit = (name, data) => {
    try {
      socket.write(Buffer.concat([ stringify(name, data), END_OF_MESSAGE ]))
    } catch (err) {
      debug('Serialize error', err)
      debug('Serialize error (data)', { name, data })
    }
  }

  return e
}


const readMessage = emit => {
  const read = buffer => {
    const index = buffer.indexOf(END_OF_MESSAGE)
    if (index === -1) {
      return buffer
    }

    const msg = buffer.slice(0, index)

    try {
      const { name, data } = parse(msg)
      emit(name, data)
    } catch (err) {
      debug('Parse error', err)
      debug('Parse error (message)', msg.toString())
    }

    const rest = buffer.slice(index + END_OF_MESSAGE.length)

    // Check for another message, return the rest (beginning of a new message)
    return read(rest)
  }
  return read
}
