import promiseRedis from 'promise-redis'
const redis = promiseRedis()

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export default class Keystore {
  constructor () {
    this.client = redis.createClient(REDIS_URL)
  }

  get (key) {
    return this.client.get(key)
  }

  getMap (key) {
    return this.client.hgetall(key)
  }

  set (key, value) {
    return this.client.set(key, value)
  }

  setMap (key, value) {
    return this.client.hmset(key, value)
  }

  destroy (key) {
    return this.client.del(key)
  }
}
