const TOKEN_KEY = 'token';

function canUseStorage(storage) {
  try {
    return typeof window !== 'undefined' && Boolean(storage);
  } catch {
    return false;
  }
}

export function getToken() {
  if (canUseStorage(window.sessionStorage)) {
    const sessionToken = window.sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) {
      return sessionToken;
    }
  }

  if (canUseStorage(window.localStorage)) {
    const legacyToken = window.localStorage.getItem(TOKEN_KEY);
    if (legacyToken && canUseStorage(window.sessionStorage)) {
      window.sessionStorage.setItem(TOKEN_KEY, legacyToken);
      window.localStorage.removeItem(TOKEN_KEY);
      return legacyToken;
    }
    return legacyToken;
  }

  return null;
}

export function setToken(token) {
  if (canUseStorage(window.sessionStorage)) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  }

  if (canUseStorage(window.localStorage)) {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  if (canUseStorage(window.sessionStorage)) {
    window.sessionStorage.removeItem(TOKEN_KEY);
  }

  if (canUseStorage(window.localStorage)) {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}
