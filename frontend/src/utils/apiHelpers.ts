import type { MarketId } from '../types/market';

const getApiBase = (): string => process.env.REACT_APP_API_URL ?? '';

export const makeApiRequest = async <T>(
  market: MarketId,
  endpoint: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; message: string }> => {
  if (!navigator.onLine) {
    return { success: false, message: 'No internet connection' };
  }
  try {
    const url = `${getApiBase()}/api/${market}${endpoint}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await response.json();
    if (!response.ok) {
      return { success: false, message: json.error || 'Request failed' };
    }
    return { success: true, data: json as T, message: 'Success' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unexpected error' };
  }
};
