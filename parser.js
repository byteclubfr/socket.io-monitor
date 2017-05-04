'use strict'

const { Type: { forValue: infer, forTypes: union, forSchema: schema } } = require('avsc')

const types = {
  password: infer('string'),
  auth: union([ infer({ authorized: true }), infer({ authorized: false, error: 'string' }) ]),
  init: infer({ rooms: [{ name: 'name', sockets: ['id'] }], sockets: ['id'] }),
  broadcast: infer({ rooms: ['name'], flags: ['flag'], name: 'event name', args: [] }),
  join: infer({ id: 'id', room: 'name' }),
  leave: infer({ id: 'id', room: 'name' }),
  leaveAll: infer({ id: 'id' }),
  connect: infer({ id: 'id' }),
  disconnect: infer({ id: 'id' }),
  emit: infer({ id: 'id', name: 'event name', args: [] }),
  recv: infer({ id: 'id', name: 'event name', args: [] }),
}

const events = [
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
]

const findEvent = (f, v) => {
  const found = events.find(e => e[f] === v)
  return found || null
}

exports.parse = buffer => {
  const code = buffer.slice(0, 2).toString('utf8')
  const event = findEvent('code', code)
  if (!event) {
    throw new Error('Unknown event code: ' + code)
  }

  const name = event.name
  const data = buffer.length > 2
    ? event.type.fromBuffer(buffer.slice(2))
    : null

  return { name, data }
}

exports.stringify = (name, data = null) => {
  const event = findEvent('name', name)
  if (!event) {
    throw new Error('Unknown event name: ' + name)
  }

  const code = event.code
  const buffer = data === null ? '' : event.type.toBuffer(data)
  return Buffer.concat([ new Buffer(code), buffer ])
}
