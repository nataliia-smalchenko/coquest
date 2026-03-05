export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: "teacher" | "student";
  auth_provider: string;
  is_email_verified: boolean;
  avatar_url?: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserResponse;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
}
