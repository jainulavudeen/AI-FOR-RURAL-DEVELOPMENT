import { describe, expect, it, vi } from 'vitest'
import { uploadBankStatement, ValidationError, MAX_FILE_SIZE_BYTES } from './service.js'
import type { BankStatementDeps } from './service.js'

const GOOD_TEXT = '01/04/2026 UPI-KIRANA STORE 500.00 DR 45,230.50\n02/04/2026 Salary Credit 25000.00 CR 70,230.50'

function makeDeps(overrides: Partial<BankStatementDeps> = {}): BankStatementDeps {
  return {
    extractText: vi.fn(async () => GOOD_TEXT),
    insertTransactions: vi.fn(async (_applicantId, transactions) => transactions.length),
    logUpload: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('uploadBankStatement', () => {
  it('rejects a non-PDF filename before ever reading the file', async () => {
    const deps = makeDeps()
    await expect(uploadBankStatement(deps, 'applicant-1', 'statement.csv', Buffer.from('x'))).rejects.toThrow(ValidationError)
    expect(deps.extractText).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const deps = makeDeps()
    await expect(uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.alloc(0))).rejects.toThrow(ValidationError)
  })

  it('rejects a file over the size limit', async () => {
    const deps = makeDeps()
    const oversized = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1)
    await expect(uploadBankStatement(deps, 'applicant-1', 'statement.pdf', oversized)).rejects.toThrow(ValidationError)
  })

  it('logs a failed upload and rejects when the PDF cannot be read', async () => {
    const deps = makeDeps({ extractText: vi.fn(async () => { throw new Error('bad pdf') }) })
    await expect(uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.from('x'))).rejects.toThrow(ValidationError)
    expect(deps.logUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', applicantId: 'applicant-1' }))
    expect(deps.insertTransactions).not.toHaveBeenCalled()
  })

  it('logs a failed upload and rejects when zero transactions are recognized', async () => {
    const deps = makeDeps({ extractText: vi.fn(async () => 'no dates or amounts here at all') })
    await expect(uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.from('x'))).rejects.toThrow(ValidationError)
    expect(deps.logUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', transactionsExtracted: 0 }))
  })

  it('inserts only into the caller applicantId, never a different one', async () => {
    const deps = makeDeps()
    await uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.from('x'))
    expect(deps.insertTransactions).toHaveBeenCalledWith('applicant-1', expect.any(Array))
  })

  it('reports success (no warnings) for a fully-classified statement', async () => {
    const deps = makeDeps()
    const result = await uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.from('x'))
    expect(result.status).toBe('success')
    expect(result.transactionsExtracted).toBe(2)
    expect(deps.logUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', transactionsExtracted: 2 }))
  })

  it('reports partial when some lines could not be classified', async () => {
    const mixedText = GOOD_TEXT + '\n05/04/2026 An unclear line with no marker 100.00'
    const deps = makeDeps({ extractText: vi.fn(async () => mixedText) })
    const result = await uploadBankStatement(deps, 'applicant-1', 'statement.pdf', Buffer.from('x'))
    expect(result.status).toBe('partial')
    expect(result.warnings).toHaveLength(1)
    expect(deps.logUpload).toHaveBeenCalledWith(expect.objectContaining({ status: 'partial' }))
  })
})
