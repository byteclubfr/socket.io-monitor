'use strict'

const debug = require('debug')('socket.io-monitor:parser')
const { Type: { forValue: infer, forTypes: union } } = require('avsc')

const types = {
  reqAuth: infer(true),
  password: infer('string'),
  auth: union([ infer({ authorized: true }), infer({ authorized: false, error: 'string' }) ]),
  init: infer({ rooms: [{ name: 'name', sockets: ['id'] }], sockets: [{ id: 'id', connectedAt: 1494426891618 }] }),
  broadcast: infer({ rooms: ['name'], flags: ['flag'], name: 'event name', args: ['json'] }),
  join: infer({ id: 'id', rooms: [ 'name' ] }),
  leave: infer({ id: 'id', room: 'name' }),
  leaveAll: infer({ id: 'id' }),
  connect: infer({ id: 'id' }),
  disconnect: infer({ id: 'id' }),
  emit: infer({ id: 'id', name: 'event name', args: ['json'] }),
  recv: infer({ id: 'id', name: 'event name', args: ['json'] }),
  string: infer({ id: 'id', string: 'string' }),
  error: infer('message'),
}

const events = [
  { name: 'reqAuth',    code: '00', type: types.reqAuth },
  { name: 'password',   code: '01', type: types.password },
  { name: 'auth',       code: '02', type: types.auth },
  { name: 'init',       code: '10', type: types.init },
  { name: 'broadcast',  code: '11', type: types.broadcast },
  { name: 'join',       code: '12', type: types.join },
  { name: 'leave',      code: '13', type: types.leave },
  { name: 'leaveAll',   code: '14', type: types.leaveAll },
  { name: 'connect',    code: '15', type: types.connect },
  { name: 'disconnect', code: '16', type: types.disconnect },
  { name: 'emit',       code: '17', type: types.emit },
  { name: 'recv',       code: '18', type: types.recv },
  { name: 'string',     code: '20', type: types.string },
  { name: 'error',      code: '99', type: types.error },
]

const findEvent = (f, v) => events.find(e => e[f] === v)

exports.parse = buffer => {
  const code = buffer.slice(0, 2).toString('utf8')
  const event = findEvent('code', code)
  if (!event) {
    throw new Error('Unknown event code: ' + code)
  }

  const { name } = event
  debug('parse', { name, code }, buffer)
  const data = buffer.length > 2
    ? event.type.fromBuffer(buffer.slice(2))
    : null

  if (data.args) {
    data.args = data.args.map(JSON.parse)
  }

  debug('parsed', { name, code }, data)

  return { name, data }
}

const emptyBuffer = new Buffer('')

exports.stringify = (name, data = null) => {
  const event = findEvent('name', name)
  if (!event) {
    throw new Error('Unknown event name: ' + name)
  }

  const { code } = event
  debug('stringify', { name, code }, data)
  const validData = data.args
    ? Object.assign({}, data, { args: data.args.map(JSON.stringify) })
    : data
  const buffer = data === null ? emptyBuffer : event.type.toBuffer(validData)
  return Buffer.concat([ new Buffer(code), buffer ])
}
