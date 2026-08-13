export function getBackendUrl() {
  return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

export function getWsUrl() {
  const explicitWsUrl = process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL;
  if (explicitWsUrl) return explicitWsUrl;

  const backendUrl = new URL(getBackendUrl());
  backendUrl.protocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
  backendUrl.pathname = "/ws";
  backendUrl.search = "";
  backendUrl.hash = "";
  return backendUrl.toString();
}

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.error || "Request failed";
    throw new Error(message);
  }

  return payload as T;
}