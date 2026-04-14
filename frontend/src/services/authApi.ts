import { apiRequest } from '@/lib/apiClient';

export type LoginResponse = {
  accessToken: string;
};

export type RegisterResponse = {
  id: string;
};

export async function loginByPhonePassword(params: {
  phone: string;
  password: string;
}) {
  return apiRequest<LoginResponse | { message?: string }>('/auth/login', {
    method: 'POST',
    body: params,
    retries: 0,
  });
}

export async function registerByPhonePassword(params: {
  phone: string;
  password: string;
  role: 'PASSENGER' | 'DRIVER';
}) {
  return apiRequest<RegisterResponse | { message?: string }>('/auth/register', {
    method: 'POST',
    body: params,
    retries: 0,
  });
}

