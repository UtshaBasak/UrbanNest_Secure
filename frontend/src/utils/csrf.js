// CSRF protection: the API sets an XSRF-TOKEN cookie and requires every
// state-changing request to echo it in the X-XSRF-TOKEN header.
// installCsrfFetch() wraps window.fetch once so every API call does this.

const COOKIE = 'XSRF-TOKEN';
const HEADER = 'X-XSRF-TOKEN';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const readToken = () => {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : '';
};

const isApiRequest = (url) => {
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin && target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

let installed = false;

export function installCsrfFetch() {
  if (installed) return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method) || !isApiRequest(url)) return nativeFetch(input, init);

    let token = readToken();
    if (!token) {
      // First write before any API read: ask the server to issue the cookie
      await nativeFetch('/api/csrf-token', { credentials: 'include' }).catch(() => {});
      token = readToken();
    }
    const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
    if (token) headers.set(HEADER, token);
    return nativeFetch(input, { ...init, headers, credentials: init.credentials || 'include' });
  };
}
