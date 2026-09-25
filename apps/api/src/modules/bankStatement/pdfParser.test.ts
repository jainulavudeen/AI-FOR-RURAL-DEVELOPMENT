import { describe, expect, it } from 'vitest'
import { parseBankStatementText } from './pdfParser.js'

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

  it('classifies a separate Debit/Credit-column layout via the running balance, no marker needed', () => {
    // Shaped like a real SBI statement export: Txn Date, Value Date,
    // Description (which itself contains the literal text "UPI/DR/..."
    // as part of the transaction reference — not a direction marker for
    // the amount), then a lone Debit-or-Credit amount, then Balance.
    // Opening balance implied by the first line's own trailing number.
    const text = [
      '28/11/2025 28/11/2025 UPI/DR/533276094192/Bakyalak/UTIB/gpay-12193/UPI 100.00 20350.75',
      '28/11/2025 28/11/2025 UPI/DR/569862426805/Palladam/YESB/paytmqr6fq/UPI 1040.00 19310.75',
      '28/11/2025 28/11/2025 PFM U300312113599 POSTMATRIC SCHOLARSH 00BPASX 37200.00 56510.75',
    ].join('\n')
    const { transactions, warnings } = parseBankStatementText(text)

    // The very first line can never be classified this way — there is no
    // prior balance to diff against — so it's an honest warning, not a
    // guess or a silent drop.
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('28/11/2025')

    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({ amount: 1040, direction: 'debit' })
    expect(transactions[1]).toMatchObject({ amount: 37200, direction: 'credit' })
  })

  it('does not misread the "DR"/"CR" inside a UPI reference code as a marker for an unrelated number', () => {
    const text = [
      '01/12/2025 01/12/2025 UPI/CR/566151084509/Karthike/SBIN/svkarthi39/UPI 1400.00 2131.85',
      '01/12/2025 01/12/2025 UPI/DR/566199274722/GoogleI/UTIB/gpayrechar/UPI 19.00 2112.85',
    ].join('\n')
    const { transactions } = parseBankStatementText(text)
    // First line unclassifiable (no prior balance); second's delta
    // (2112.85 - 2131.85 = -19.00) matches its printed amount exactly,
    // so it's confidently a debit — even though the description text
    // contains "DR" nowhere near the amount, and "CR" belongs to the
    // *previous* line's own reference code, not this one.
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ amount: 19, direction: 'debit' })
  })

  it('does not guess when a mid-statement delta does not match the printed amount', () => {
    const text = [
      '01/12/2025 Opening row 100.00 1000.00',
      '02/12/2025 Suspicious row 50.00 1200.00', // delta is +200, not 50 — inconsistent, must not guess
    ].join('\n')
    const { transactions, warnings } = parseBankStatementText(text)
    expect(transactions).toHaveLength(0)
    expect(warnings).toHaveLength(2)
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
