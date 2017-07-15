import kurento from 'kurento-client'

const url = process.env.KURENTO_URL || 'ws://localhost:8888/kurento'

/**
 * This function proxies every non-Promise method on an object
 * to the backing object.
 */
function proxy (input) {
  const proxy = { }
  for (let key in input) {
    if (typeof input[key] !== 'function')
      continue

    if (!['then', 'catch'].includes(key)) {
      proxy[key] = input[key].bind(input)
    }
  }

  proxy.proxied = input
  return proxy
}

export default class MediaServer {
  client = null
  candidates = { }
  elements = { }

  getClient () {
    if (this.client) {
      return this.client
    }

    return kurento(url, { }).then(proxy)
  }

  async createPipeline () {
    const client = await this.getClient()
    return client.create('MediaPipeline').then(proxy)
  }

  async start(stream, socket, offer) {
    console.log(`building pipeline for ${stream}`)
    const pipeline = await this.createPipeline()

    try {
      console.log('creating RTC endpoint')
      const endpoint = await pipeline.create('WebRtcEndpoint').then(proxy)

      console.log('creating recording endpoint')
      const recorder = await pipeline.create('RecorderEndpoint', { 
        uri: `file:///tmp/${stream}.webm`,
        mediaProfile: 'WEBM_VIDEO_ONLY'
      }).then(proxy)

      endpoint.on('MediaStateChanged', (event) => {
        console.log(event)
      })

      if (this.candidates[stream]) {
        while (this.candidates[stream].length) {
          const candidate = this.candidates[stream].shift()
          endpoint.addIceCandidate(candidate)
        }
      }

      console.log('connecting endpoint to recorder')
      await new Promise((resolve, reject) => {
        endpoint.connect(recorder.proxied, (err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
      })

      console.log('beginning record')
      await new Promise((resolve, reject) => {
        recorder.record((err) => {
          if (err) {
            return reject(err)
          }
          resolve()
        })
      })

      endpoint.on('OnIceCandidate', (event) => {
        const candidate = kurento.getComplexType('IceCandidate')(event.candidate)
        socket.send(JSON.stringify({ type: 'candidate', candidate }))
      })

      const answer = await endpoint.processOffer(offer)
      this.elements[stream] = { pipeline, endpoint, recorder }

      await endpoint.gatherCandidates()

      return answer
    } catch (e) {
      console.log(e)
      pipeline.release()
      throw e
    }
  }

  async stop(stream) {
    console.log(`releasing pipeline for stream ${stream}`)
    const { pipeline, recorder } = this.elements[stream]
    if (pipeline != null) {
      recorder.stop()
      pipeline.release()
    }

    delete this.candidates[stream]
    delete this.elements[stream]
  }

  async candidate(stream, candidate) {
    const hydrated = kurento.getComplexType('IceCandidate')(candidate)

    if (this.elements[stream]) {
      const { endpoint } = this.elements[stream]
      endpoint.addIceCandidate(hydrated)
    } else {
      if (!this.candidates[stream]) {
        this.candidates[stream] = []
      }

      this.candidates[stream].push(hydrated)
    }
  }
}
