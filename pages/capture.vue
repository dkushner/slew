<template lang='pug'>
  .capture
    .placeholder(v-if='denied')
      h3 This experiment requires features that your browser does not support.
    .playback
      video(ref='playback', v-if='!denied', autoplay='')
    .controls
      button.record(@touchstart.prevent='start', @touchend.prevent='stop', 
                    @mousedown.prevent='start', @mouseup.prevent='stop', 
                    @contextmenu.prevent='')
</template>

<script>
const KurentoUtils = (process.BROWSER_BUILD) ? require('kurento-utils') : null

const IDLE = 0;
const STARTING = 1;
const STARTED = 2;

export default {
  data () {
    return {
      denied: false,
      state: IDLE
    }
  },
  async mounted () {
    const socket = new WebSocket(`ws://${process.env.host}`)
    socket.addEventListener('message', this.handleMessage)
    this.socket = socket

    window.addEventListener('devicemotion', this.handleMotion)
  },
  methods: {
    handleError (e) {
      console.error(e)
    },
    handleMotion (e) {
      console.log(e)
    },
    async handleMessage (message) {
      const decoded = JSON.parse(message.data)
      console.log(`client received '${decoded.type}' message`)

      switch (decoded.type) { 
        case 'start': {
          console.log(`received SDP answer from STUN server`)
          this.state = STARTED
          this.peer.processAnswer(decoded.answer)
        } break
        case 'error': {
          if (this.state === STARTING) {
            this.state = IDLE
          }
          console.error(`received error from broker`, decoded.message)
        } break
        case 'candidate': {
          this.peer.addIceCandidate(decoded.candidate)
        } break
        default:
          break
      }
    },
    handleCandidate (candidate) {
      console.log('received candidate')
      const message = {
        type: 'candidate',
        candidate
      }

      this.socket.send(JSON.stringify(message))
    },
    async start () {
      console.log(`starting recording`)
      this.state = STARTING

      console.log(`setting up peer and extending offer`)
      const options = {
        localVideo: this.$refs.playback,
        onicecandidate: this.handleCandidate,
        mediaConstraints: {
          audio: false,
          video: {
            width: 1280,
            height: 720
          }
        }
      }

      const peer = await new Promise((resolve, reject) => {
        const peer = KurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, async (err) => {
          if (err) {
            return reject(err)
          }
          resolve(peer)
        })
      })

      const offer = await new Promise((resolve, reject) => {
        peer.generateOffer((err, offer) => {
          if (err) {
            return reject(err)
          }

          resolve(offer)
        })
      })

      this.socket.send(JSON.stringify({ type: 'start', offer }))
      this.peer = peer
    },
    stop () {
      this.state = IDLE
      if (this.peer) {
        this.peer.dispose()
        this.peer = null

        this.socket.send(JSON.stringify({
          type: 'stop'
        }))
      }
    }
  }
}
</script>

<style lang='sass'>
.capture
  width: 100vw
  height: 100vh
  position: relative

.playback
  width: 100%
  height: 100%

  > video
    width: 100%
    height: 100%
    object-fit: cover

.placeholder 
  position: absolute
  text-align: center
  left: 0
  right: 0
  top: 0
  bottom: 0
  display: flex
  flex-direction: column
  justify-content: center
  align-items: center
  background: #fff
  z-index: 200

.controls 
  position: absolute
  left: 0
  right: 0
  top: 0
  bottom: 0
  z-index: 100
  background: rgba(0, 0, 0, 0.2)
  display: flex
  flex-direction: column
  justify-content: center
  align-items: center

.record
  width: 32vw
  height: 32vw
  border-radius: 16vw
  border: none
  background: #fff
  outline: none
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.0)
  
</style>
