import assert from 'node:assert/strict'
import { isDeadDbConnection, postgresPoolOptions } from './db.ts'

const hosted = postgresPoolOptions('postgresql://user:pass@db.example:6543/postgres')
assert.equal(hosted.max, 1)
assert.equal(hosted.prepare, false)
assert.equal(hosted.fetch_types, false)
assert.equal(hosted.ssl, 'require')
assert.equal(hosted.idle_timeout, 8)
assert.equal(hosted.max_lifetime, 60)
assert.equal(hosted.connect_timeout, 3)

const local = postgresPoolOptions('postgresql://postgres:postgres@localhost:5432/todo')
assert.equal(local.ssl, false)

assert.equal(isDeadDbConnection(new Error('CONNECTION_CLOSED')), true)
assert.equal(isDeadDbConnection(new Error('read ECONNRESET')), true)
assert.equal(isDeadDbConnection(new Error('write EPIPE')), true)
assert.equal(isDeadDbConnection(new Error('Connection terminated unexpectedly')), true)
assert.equal(isDeadDbConnection(new Error('timeout')), true)
assert.equal(isDeadDbConnection(new Error('duplicate key value')), false)
assert.equal(isDeadDbConnection('not queryable'), true)

console.log('db-pool tests passed')
