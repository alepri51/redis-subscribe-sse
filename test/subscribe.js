import test from 'ava'
import subscribe from '..'
import stream from 'stream'
import Redis from 'ioredis'

const Readable = stream.Readable
const redis = new Redis()


test('Should throw if option `channels` is missing', t => {
  let exception = t.throws(() => {
    let s = subscribe()
  })

  t.is(exception.message, 'option `channels` is required and must be an Array or a String')
})


test('Should throw if option `ioredis` is not an object', t => {
  let exception = t.throws(() => {
    let s = subscribe({
      channels: 'test',
      ioredis: 'invalid'
    })
  })

  t.is(exception.message, 'option `ioredis` must be an Object')
})


test('Should throw if option `transform` is not a function', t => {
  let exception = t.throws(() => {
    let s = subscribe({
      channels: 'test',
      transform: []
    })
  })

  t.is(exception.message, 'option `transform` must be a function')
})


test('Should throw if options `retry` is invalid', t => {
  let exception = t.throws(() => {
    let s = subscribe({
      channels: 'test',
      retry: -1
    })
  })

  t.is(exception.message, 'option `sse.retry` must be a Number greater than 0')
})


test('Should get a Subscribe stream with default options', t => {
  let s = subscribe({
    channels: ['a', 'lot', 'of', 'channels'],
  })

  t.deepEqual(s.host, '127.0.0.1')
  t.deepEqual(s.port, 6379)
})


test('Should get a Subscribe stream with custom options', t => {
  let s = subscribe({
    channels: ['a', 'lot', 'of', 'channels'],
    host: '192.168.0.10',
    port: '9999',
    retry: 7000,
    ioredis: {
      enableOfflineQueue: false
    },
    transform: (msg) => {
      return msg.toUpperCase()
    }
  })

  t.deepEqual(s.channels, ['a', 'lot', 'of', 'channels'])
  t.deepEqual(s.host, '192.168.0.10')
  t.deepEqual(s.port, 9999)
  t.deepEqual(s.retry, 7000)
  t.true(typeof s.transform == 'function')
  t.deepEqual(s.ioredis, {
    enableOfflineQueue: false
  })
})


test.cb('Should stream Redis published messages as SSE', t => {
  t.plan(2)

  let chunks = 0

  let s = subscribe({
    channels: 'test'
  })

  s.on('ready', () => {
    redis.publish('test', 'test-message')
  })

  s.on('data', (data) => {
    if (chunks === 0) {
      t.deepEqual(data.toString(), 'retry: 5000\n')
    }

    if (chunks === 1) {
      t.deepEqual(data.toString(), 'data: test-message\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should stream Redis published messages as SSE events (multiple channels)', t => {

  t.plan(2)

  let chunks = 0

  let s = subscribe({
    channels: ['channel1', 'channel2']
  })

  s.on('ready', () => {
    redis.publish('channel1', 'test-message1')
    redis.publish('channel2', 'test-message2')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'data: test-message1\n\n')
    }

    if (chunks === 2) {
      t.deepEqual(data.toString(), 'data: test-message2\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should associate Redis channels to SSE events when `channelsAsEvents` option is true', t => {
  t.plan(2)

  let chunks = 0

  let s = subscribe({
    channels: 'named-channel',
    channelsAsEvents: true
  })

  s.on('ready', () => {
    redis.publish('named-channel', 'test-message')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'event: named-channel\n')
    }

    if (chunks === 2) {
      t.deepEqual(data.toString(), 'data: test-message\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should associate Redis channels to SSE events when `channelsAsEvents` option is true (multiple channels)', t => {
  t.plan(4)

  let chunks = 0

  let s = subscribe({
    channels: ['named-channel1', 'named-channel2'],
    channelsAsEvents: true
  })

  s.on('ready', () => {
    redis.publish('named-channel1', 'test-message')
    redis.publish('named-channel2', 'test-message')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'event: named-channel1\n')
    }

    if (chunks === 2) {
      t.deepEqual(data.toString(), 'data: test-message\n\n')
    }

    if (chunks === 3) {
      t.deepEqual(data.toString(), 'event: named-channel2\n')
    }

    if (chunks === 4) {
      t.deepEqual(data.toString(), 'data: test-message\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should stream Redis published messages as SSE (using PSUBSCRIBE)', t => {
  t.plan(1)

  let chunks = 0

  let s = subscribe({
    channels: 'pattern*',
    patternSubscribe: true
  })

  s.on('ready', () => {
    redis.publish('pattern-subscribe', 'test-pattern-subscribe-message')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'data: test-pattern-subscribe-message\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should do a sync transform on received Redis messages before pushing them', t => {
  t.plan(1)

  let chunks = 0

  let s = subscribe({
    channels: 'transform',
    transform: (msg) => {
      return `${msg} world`
    }
  })

  s.on('ready', () => {
    redis.publish('transform', 'hello')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'data: hello world\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should do an async transform on received Redis messages before pushing them', t => {
  t.plan(1)

  let chunks = 0

  let s = subscribe({
    channels: 'transform',
    transform: (msg, callback) => {
      setTimeout(() => {
        callback(`${msg} world`)
      }, 100)
    }
  })

  s.on('ready', () => {
    redis.publish('transform', 'hello')
  })

  s.on('data', (data) => {
    if (chunks === 1) {
      t.deepEqual(data.toString(), 'data: hello world\n\n')
      t.end()
    }

    chunks++
  })
})


test.cb('Should close underlying redis connection correctly', t => {

  let s = subscribe({
    channels: 'close'
  })

  s.client.on('end', () => {
    t.pass()
    t.end()
  })

  s.on('ready', () => {
    s.close()
  })

})


test.cb('Should call callback after close (if passed)', t => {

  let s = subscribe({
    channels: 'close'
  })

  s.on('ready', () => {

    s.close(() => {
      t.pass()
      t.end()
    })

  })

})

