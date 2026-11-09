// The one place the API base URL lives.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const PROD_API = 'https://api.kalospt.ca';
const DEV_API = 'http://localhost:4000';

function devOverride() {
  if (!LOCAL) return null;
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q) sessionStorage.setItem('kalos-label-api', q);
    return sessionStorage.getItem('kalos-label-api');
  } catch {
    return null;
  }
}

export const API_BASE = (devOverride() || (LOCAL ? DEV_API : PROD_API)).replace(/\/+$/, '');
export const API_PREFIX = '/api/label';
