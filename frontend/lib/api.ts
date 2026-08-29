const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();

if (!configuredApiBase) {
  throw new Error("NEXT_PUBLIC_API_URL is not configured.");
}

export const API_BASE = configuredApiBase.replace(/\/+$/, "");

type RequestOptions = Omit<RequestInit, "credentials">;

async function request(path: string, options: RequestOptions = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
  });
}

export const api = {
  get(path: string, options?: RequestOptions) {
    return request(path, { ...options, method: "GET" });
  },
  post(path: string, data?: unknown, options: RequestOptions = {}) {
    return request(path, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  },
};
