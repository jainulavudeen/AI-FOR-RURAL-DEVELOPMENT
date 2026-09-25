import type { FastifyPluginAsync } from 'fastify'
import { qrSvg, verificationUrl } from '../../lib/qr.js'
import { createBankDossierDeps } from './deps.js'
import { generateDossier, getDossier, getDossierApproval } from './service.js'
import type { GenerateDossierBody } from './types.js'

// A printable financial document is squarely a "saving" action, same class
// as accountAggregator/siteCapture. Generation needs connectivity (it
// assembles a fresh snapshot); viewing an already-generated dossier by id
// is cheap and cacheable — see vite.config.js's StaleWhileRevalidate entry
// on the web side for the offline-reprint story.
//
// There is no approve route here any more. Approval happens only through
// an application assigned to the officer (modules/applications), which is
// what enforces "an officer sees and decides only their own cases".
// Public hash verification lives at GET /applications/verify/:hash (it
// also accepts hashes from the retired standalone approvals).
const bankDossierRoutes: FastifyPluginAsync = async (fastify) => {
  const deps = createBankDossierDeps(fastify)

  // An applicant's own self-serve copy (e.g. "Print Bank Dossier for this
  // scheme") — never approved, so it always prints "Pending review".
  fastify.post<{ Body: GenerateDossierBody }>('/generate', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const dossier = await generateDossier(deps, request.user.sub, request.body ?? ({} as GenerateDossierBody))
    return reply.status(201).send(dossier)
  })

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [fastify.requireRole('applicant', 'officer', 'admin')] },
    async (request, reply) => {
      const dossier = await getDossier(deps, request.user.sub, request.user.role, request.params.id)
      const approval = await getDossierApproval(deps, request.user.sub, request.user.role, request.params.id)
      const verifyUrl = approval ? verificationUrl(approval.signatureHash) : null
      return reply.status(200).send({
        ...dossier,
        approval,
        verifyUrl,
        qrSvg: verifyUrl ? await qrSvg(verifyUrl) : null,
      })
    }
  )
}

export default bankDossierRoutes
