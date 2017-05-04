'use strict'

const events = [
  { name: 'password',   code: '01' },
  { name: 'auth',       code: '02' },
  { name: 'init',       code: '10' },
  { name: 'broadcast',  code: '11' },
  { name: 'join',       code: '12' },
  { name: 'leave',      code: '13' },
  { name: 'leaveAll',   code: '14' },
  { name: 'connect',    code: '15' },
  { name: 'disconnect', code: '16' },
  { name: 'emit',       code: '17' },
  { name: 'recv',       code: '18' },
]

const eventCode = name => {
  const found = events.find(e => e.name === name)
  return found ? found.code : null
}

const eventName = code => {
  const found = events.find(e => e.code === code)
  return found ? found.name : null
}

exports.parse = buffer => {
  const [ code, data ] = JSON.parse(buffer)
  const name = eventName(code)
  if (name === null) {
    throw new Error('Unknown event code: ' + code)
  }
  return { name, data }
}

exports.stringify = (name, data = null) => {
  const code = eventCode(name)
  if (code === null) {
    throw new Error('Unknown event name: ' + name)
  }
  return new Buffer(JSON.stringify([code, data]))
}
