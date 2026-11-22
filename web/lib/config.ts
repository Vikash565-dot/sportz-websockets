const env = import.meta.env;

export function getBackendUrl() {
  return (env.VITE_BACKEND_URL || "/api").replace(/\/$/, "");
}

export function getWsUrl() {
  if (env.VITE_WS_URL) return env.VITE_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    cache: "no-store", ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof payload === "string" ? payload : payload?.error || "Request failed");
  return payload as T;
}
