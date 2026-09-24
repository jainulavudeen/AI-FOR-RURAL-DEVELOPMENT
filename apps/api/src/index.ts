import './config/loadEnv.js'
import { buildApp } from './app.js'
import { env } from './config/env.js'

const app = buildApp()

app
  .listen({ port: env.API_PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`Setu API listening on :${env.API_PORT}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
