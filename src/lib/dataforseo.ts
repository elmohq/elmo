import * as client from 'dataforseo-client'

function createAuthenticatedFetch(username: string, password: string) {
    return (url: RequestInfo, init?: RequestInit): Promise<Response> => {
      const token = btoa(`${username}:${password}`);
      const authHeader = { 'Authorization': `Basic ${token}` };

      const newInit: RequestInit = {
        ...init,
        headers: {
          ...init?.headers,
          ...authHeader,
          'Content-Type': 'application/json'
        }
      };

      return fetch(url, newInit);
    };
}

const authFetch = createAuthenticatedFetch(process.env.DATAFORSEO_LOGIN!, process.env.DATAFORSEO_PASSWORD!);
export const dfsLabsApi = new client.DataforseoLabsApi("https://api.dataforseo.com", { fetch: authFetch });
export const dfsSerpApi = new client.SerpApi("https://api.dataforseo.com", { fetch: authFetch });
