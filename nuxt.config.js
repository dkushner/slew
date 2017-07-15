module.exports = {
  /*
  ** Headers of the page
  */
  head: {
    title: 'Slew',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'Slew structure from motion' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },
  build: {
    vendor: ['kurento-utils']
  },
  /*
  ** Global CSS
  */
  css: [
    { src: '~assets/styles/global.sass' }
  ],
  /*
  ** Customize the progress-bar color
  */
  loading: { color: '#3B8070' }
}
