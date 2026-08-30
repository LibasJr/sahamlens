export type HealthState = 'checking' | 'connected' | 'offline';

export async function checkHealth(baseUrl = ''): Promise<HealthState> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
    return response.ok ? 'connected' : 'offline';
  } catch {
    return 'offline';
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
