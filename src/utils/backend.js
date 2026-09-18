export async function backend(path, data, {
  signal
} = {}) {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    signal,
    headers: data === undefined ? {} : {
      'Content-Type': 'application/json',
      'X-Umbrify-Request': '1'
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
    const error = new Error(result.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}
