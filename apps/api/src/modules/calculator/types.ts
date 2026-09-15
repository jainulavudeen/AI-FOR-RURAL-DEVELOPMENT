export interface StructureRequestBody {
  marginCapital: number
}

export interface EmiRequestBody {
  loanAmount: number
  interestRate: number
  tenureYears: number
  moratoriumMonths: number
}
