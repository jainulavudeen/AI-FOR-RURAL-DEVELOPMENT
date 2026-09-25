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

export interface GoogleSignInBody {
  // The GIS `credential` — a Google-signed ID token. Nothing else about
  // the user is ever read from the request.
  credential: string
}

export interface LinkPhoneBody {
  phone: string
  code: string
}
