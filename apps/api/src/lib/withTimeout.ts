// Shared by feasibility/service.ts (Agmarknet) and the LLM/grounding
// pipeline — CLAUDE.md rule 4: the app degrades instead of erroring, so
// every external call that could hang gets a hard bound.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
