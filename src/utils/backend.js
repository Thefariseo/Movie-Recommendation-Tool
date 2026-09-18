let accountId = null;
export function setBackendAccount(id) {
  accountId = id;
}
export async function backend(path, data, {
  signal,
  account = accountId
} = {}) {
  const publicAuth = path === 'auth' || /^auth\?action=(session|login|signup|recover|google|email-callback)(?:&|$)/.test(path);
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    signal,
    headers: {
      ...(!publicAuth && account ? {
        'X-Umbrify-Account': account
      } : {}),
      ...(data === undefined ? {} : {
        'Content-Type': 'application/json',
        'X-Umbrify-Request': '1'
      })
    },
    ...(data === undefined ? {} : {
      method: 'POST',
      body: JSON.stringify(data)
    })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The account service is unavailable. Please try again later.');
  }
  if (!response.ok) {
    if (result.code === 'account_changed') window.dispatchEvent(new Event('umbrify-account-changed'));
    const error = new Error(result.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}
