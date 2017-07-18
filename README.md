# socket.io-monitor

Monitor sockets, rooms, events in your socket.io server. This module includes the server and client libraries.

See [socket.io-monitor-cli](https://github.com/byteclubfr/socket.io-monitor-cli) for a realtime dashboard in your console.

## Installation

```sh
npm install --save socket.io-monitor
```

## Usage (local)

1. Bind your socket.io server:

```js
const monitor = require('socket.io-monitor')
const { emitter } = monitor.bind(io, { server: false })
```

2. In same process, use emitter to grab info:

```js
emitter.getState()
/* {
  rooms: [ { name: 'room1', sockets: [ 'id1', 'id2' ] }, … ],
  sockets: [ { id: 'id1', connectedAt: 12345 }, { id: 'id2', connectedAt: 56789 }, … ]
} */

emitter.on('join', ({ id, rooms }) => console.log('socket %s joins rooms %s', id, rooms))
```

## Usage (remote)

1. Bind your socket.io server:

```js
const monitor = require('socket.io-monitor')
const { server } = monitor.bind(io, { port: 9042, host: 'localhost' })

server.then(srv => {
  console.log('connection OK')
})
```

2. In another process, connect to your monitor server:

```js
const monitor = require('socket.io-monitor')
const client = monitor.connect({ port: 9042, host: 'localhost' })

client.then(emitter => {
  console.log('connection OK')
  emitter.on('join', ({ id, rooms }) => console.log('socket %s joins rooms %s', id, rooms))
})
```

## Events

* (remote only) **init** ``state``
  * (local only) method *getState()* returns ``state``
* (local only) **client** ``{ client, state }``
  * ``client`` is the remote monitor client (you can listen/emit to all *remote* events)
  * ``state`` is the initial state data, sent along *init* event
* **broadcast** ``{ name, args, rooms, flags }``
* **join** ``{ id, rooms }``
* **leave** ``{ id, room }``
* **leaveAll** ``{ id }``
* **connect** ``{ id }``
* **disconnect** ``{ id }``
* **emit** ``{ id, name, args }``
* **recv** ``{ id, name, args }``
* **string** ``{ id, string }``
  * this event should be used by monitor client implementation to display alternative string representation of a socket. This event is never emitted for you, see example below.

### State

* **rooms**: ``[ { name: string, sockets: [ string ] } ]``
* **sockets**: ``[ { id: string, connectedAt: timestamp-ms } ]``

### Socket string representation

You can emit `string` event to provide alternative string representation for a socket, that can be used by monitor client.

```js
// Example 1: when user emits a "login" event, we use it as string representation
const { emitter } = monitor.bind(io, options)

io.on('connection', socket => {
  socket.on('login', username => {
    // store somewhere that socket is bound to this username
    emitter.emit('string', { id: socket.id, string: username })
  })
})
```

Real-life use case: once a socket is authenticated and bound to a user we put it in a dedicated room *user:$username*. This is frequently done to be able to target a socket knowing only the username. We take advantage of this situation to only rely on emitter instead of modifying existing code:

```js
const { emitter } = monitor.bind(io, options)
// 'join' event is emitted each time a socket joins a room
emitter.on('join', ({ id, room }) => {
  // we only have to check if room has the known prefix, and voilà!
  if (room.match(/^user:/)) {
    emitter.emit('string', { id, string: room.substring(5) })
  }
})
```

In both cases however, emitting string representation just when a socket connects is not enough: when you connect a monitor client, it will fetch existing sockets and will not receive *string* events for them. In current version it's up to you to handle this case too. This part may change in the future to make it easier. The current best way is to listen for *client* event which is called when a monitor client receives state data:

```js
emitter.on('client', (client, state) => {
  // state.rooms = list of rooms with socket ids in them
  // state.sockets = list of sockets
  // in our sample, an identified socket is in a room named "user:$username"
  state.rooms.forEach(({ name, sockets }) => {
    if (name.match(/^user:/)) {
      const id = sockets[0]
      const string = name.substring(5)
      client.emit('string', { id, string })
    }
  })
})
```
