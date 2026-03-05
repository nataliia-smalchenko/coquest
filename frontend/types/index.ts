export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "teacher" | "student";
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  role: "teacher" | "student";
}
