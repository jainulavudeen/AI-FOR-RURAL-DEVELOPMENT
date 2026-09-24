import { env } from '../config/env.js'
import { EMBEDDING_DIMENSIONS } from '../config/constants.js'

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}

// Deterministic hash-seeded vectors — no credentials needed, same posture as
// every other mock provider in this app. Not semantically meaningful (this
// is the honest known-gap equivalent of MockAgmarknetProvider's synthetic
// prices), but it exercises the whole retrieval pipeline — chunking,
// storage, pgvector cosine search, citation assembly — end to end with zero
// external calls.
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    let seed = hashSeed(text)
    const vector: number[] = []
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
      seed = (seed * 9301 + 49297) % 233280
      vector.push(seed / 233280 - 0.5)
    }
    return vector
  }
}

// Voyage AI — Anthropic's recommended embeddings partner (Anthropic doesn't
// serve embeddings directly). Real, credential-gated, same shape as
// RealAgmarknetProvider: a plain REST call, no SDK needed for one endpoint.
const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings'

export class RealEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('VOYAGE_API_KEY must be set when EMBEDDING_PROVIDER=real')
    }

    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: [text], model: 'voyage-3-lite' }),
    })

    if (!response.ok) {
      throw new Error(`Voyage embeddings fetch failed: ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> }
    const embedding = data.data?.[0]?.embedding
    if (!embedding) {
      throw new Error('Voyage embeddings response had no embedding')
    }
    return embedding
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  if (env.EMBEDDING_PROVIDER === 'real') {
    return new RealEmbeddingProvider(env.VOYAGE_API_KEY ?? '')
  }
  return new MockEmbeddingProvider()
}

// pgvector's text literal form, e.g. "[0.1,0.2,...]" — the drizzle `vector`
// customType round-trips embeddings as plain strings (see db/schema/
// customTypes.ts), so every write/query goes through this.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
