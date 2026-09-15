import './config/loadEnv'
import { buildApp } from './app'
import { env } from './config/env'

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
