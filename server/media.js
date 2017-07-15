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

  async start(session, socket, offer) {
    console.log(`server received SDP offer for ${session.id}`)
    const sessionId = session.id

    console.log(`building pipeline for ${session.id}`)
    const pipeline = await this.createPipeline()

    try {
      console.log('creating pipeline')
      const endpoint = await pipeline.create('WebRtcEndpoint').then(proxy)

      console.log('creating recording endpoint')
      const recorder = await pipeline.create('RecorderEndpoint', { 
        uri: `file:///tmp/${sessionId}.webm`,
        mediaProfile: 'WEBM_VIDEO_ONLY'
      }).then(proxy)

      endpoint.on('MediaStateChanged', (event) => {
        console.log(event)
      })

      if (this.candidates[sessionId]) {
        while (this.candidates[sessionId].length) {
          const candidate = this.candidates[sessionId].shift()
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
      session.pipeline = pipeline
      session.endpoint = endpoint
      session.recorder = recorder

      await endpoint.gatherCandidates()

      return answer
    } catch (e) {
      console.log(e)
      pipeline.release()
      throw e
    }
  }

  async stop(session) {
    console.log(`releasing pipeline for session ${session.id}`)
    const pipeline = session.pipeline
    const recorder = session.recorder
    if (pipeline != null) {
      recorder.stop()
      pipeline.release()
    }

    delete this.candidates[session.id]
    delete session.pipeline
    delete session.endpoint
    delete session.recorder
  }

  async candidate(session, candidate) {
    const hydrated = kurento.getComplexType('IceCandidate')(candidate)

    if (session.endpoint && session.pipeline) {
      const endpoint = session.endpoint
      endpoint.addIceCandidate(hydrated)
    } else {
      if (!this.candidates[session.id]) {
        this.candidates[session.id] = []
      }

      this.candidates[session.id].push(hydrated)
    }
  }
}
