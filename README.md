# socket.io-monitor

Monitor sockets, rooms, events in your socket.io server. This module includes the server and client libraries.

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
// { rooms: [ { name: 'room1', sockets: [ 'id1', 'id2' ] } ], sockets: [ 'id1', 'id2', … ] }

emitter.on('join', ({ id, room }) => console.log('socket %s joins room %s', id, room))
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
  emitter.on('join', ({ id, room }) => console.log('socket %s joins room %s', id, room))
})
```

## Events

* (remote only) **init** ``state``
  * (local only) method *getState()* returns ``state``
* **broadcast** ``{ name, args, rooms, flags }``
* **join** ``{ id, room }``
* **leave** ``{ id, room }``
* **leaveAll** ``{ id }``
* **connect** ``{ id }``
* **disconnect** ``{ id }``
* **emit** ``{ id, name, args }``
* **recv** ``{ id, name, args }``

### State

* **rooms**: ``[ { name: string, sockets: [ string ] } ]``
* **sockets**: ``[ string ]``
