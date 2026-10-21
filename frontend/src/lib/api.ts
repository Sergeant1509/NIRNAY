import { auth } from './firebase';
const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');
type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit };

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const user = auth?.currentUser;
  if (user) headers.set('Authorization', 'Bearer ' + await user.getIdToken());
  const response = await fetch(API_BASE_URL + path, { ...options, headers });
  if (!response.ok) {
    let message = 'Request failed (' + response.status + ')';
    try { const body = await response.json() as { detail?: string; message?: string }; message = body.detail || body.message || message; }
    catch { /* Keep status-based error text when body is not JSON. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function apiDownload(path: string): Promise<Blob> {
  const headers = new Headers();
  const user = auth?.currentUser;
  if (user) headers.set('Authorization', 'Bearer ' + await user.getIdToken());
  const response = await fetch(API_BASE_URL + path, { headers });
  if (!response.ok) {
    let message = 'Download failed (' + response.status + ')';
    try { const body = await response.json() as { detail?: string }; message = body.detail || message; } catch { /* Non-JSON response. */ }
    throw new Error(message);
  }
  return response.blob();
}
export interface UserProfile { uid: string; email: string | null; display_name: string | null; email_verified: boolean; role: string | null; }
export interface UserRecord { id: string; title: string; kind: 'saved_tender' | 'verification_note' | 'other'; data: Record<string, unknown>; created_at: string | null; updated_at: string | null; }
export interface UserDocument { id: string; filename: string; content_type: string; size_bytes: number; created_at: string | null; }