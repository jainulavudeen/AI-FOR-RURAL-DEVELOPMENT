import { describe, expect, it } from 'vitest'
import { parseBankStatementText } from './pdfParser'

describe('parseBankStatementText', () => {
  it('extracts a debit line with a DR marker after the amount', () => {
    const text = '01/04/2026 UPI-RAVI KUMAR-9876543210 500.00 DR 45,230.50'
    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ amount: 500, direction: 'debit' })
    expect(transactions[0]?.description).toContain('UPI-RAVI KUMAR')
    expect(warnings).toHaveLength(0)
  })

  it('extracts a credit line with a CR marker, dashes in the date', () => {
    const text = '02-04-2026 Salary Credit ABC Ltd 25000.00 CR 70,230.50'
    const { transactions } = parseBankStatementText(text)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ amount: 25000, direction: 'credit' })
  })

  it('extracts a line using a textual month and DEBIT/CREDIT keywords', () => {
    const text = '05 Apr 2026 NEFT TRANSFER TO XYZ 1200.00 DEBIT 69,030.50\n06 Apr 2026 Freelance Payment 3000.00 CREDIT 72,030.50'
    const { transactions } = parseBankStatementText(text)
    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({ amount: 1200, direction: 'debit' })
    expect(transactions[1]).toMatchObject({ amount: 3000, direction: 'credit' })
  })

  it('supports the DR/CR keyword appearing before the amount', () => {
    const text = '07/04/2026 Cash Withdrawal DR 2000.00 67,030.50'
    const { transactions } = parseBankStatementText(text)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ amount: 2000, direction: 'debit' })
  })

  it('ignores non-transaction lines with no leading date, even if they contain numbers', () => {
    const text = 'Opening Balance as on 01/04/2026: 45,730.50\nStatement Period: 01/04/2026 to 30/04/2026\nAccount Number: 1234567890'
    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('warns (does not guess) on a transaction-shaped line with no DR/CR marker', () => {
    const text = '10/04/2026 Some transaction with an unclear amount 999.99'
    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('10/04/2026')
  })

  it('rejects an impossible date (month 13) rather than misreading it', () => {
    const text = '01/13/2026 Bad date line 500.00 DR 100.00'
    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('handles a realistic multi-line statement end to end', () => {
    const text = [
      'ABC Bank — Statement of Account',
      'Account Number: XXXXXXXX1234',
      'Statement Period: 01/06/2026 to 30/06/2026',
      'Date        Narration                          Amount      Type  Balance',
      '01/06/2026  UPI-KIRANA STORE-8765432109         850.00      DR    12,150.00',
      '03/06/2026  IMPS FROM RAVI SHARMA               5000.00     CR    17,150.00',
      '05/06/2026  ATM WDL NEW DELHI                   2000.00     DR    15,150.00',
      '10/06/2026  SALARY CREDIT JUNE                  35000.00    CR    50,150.00',
      '12/06/2026  Some unusual entry with no marker',
      'Closing Balance: 50,150.00',
    ].join('\n')

    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(4)
    expect(transactions.filter((t) => t.direction === 'debit')).toHaveLength(2)
    expect(transactions.filter((t) => t.direction === 'credit')).toHaveLength(2)
    expect(warnings).toHaveLength(1)
  })
})
