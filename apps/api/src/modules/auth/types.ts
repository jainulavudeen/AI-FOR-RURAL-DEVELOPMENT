export interface OtpRequestBody {
  phone: string
}

export interface OtpVerifyBody {
  phone: string
  code: string
}

export interface RefreshBody {
  refreshToken: string
}

export interface LogoutBody {
  refreshToken?: string
}
