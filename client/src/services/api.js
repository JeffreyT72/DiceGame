export async function request(path, options) {
  const response = await fetch(path, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}
