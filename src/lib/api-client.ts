import { supabase } from "./supabase";

// The app keeps its Supabase session in localStorage (client-side), so server
// route handlers cannot read it from cookies. Attach the access token as a
// bearer token so the API routes can authenticate the caller.
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  function buildHeaders(token: string | null): Headers {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type") && !isFormData) {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  }

  // getSession() returns the stored session, refreshing it when it has expired.
  // If even that fails (e.g. the tab was idle for a long time or the refresh
  // request failed transiently), try an explicit refresh before giving up.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;

  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
  }

  let response = await fetch(input, { ...init, headers: buildHeaders(token) });

  // The token can expire while a background tab is suspended. When the server
  // rejects it, refresh once and replay the request instead of showing
  // "Not authorized" to a user who is still logged in.
  if (response.status === 401 && token) {
    const { data, error } = await supabase.auth.refreshSession();
    const freshToken = error ? null : data.session?.access_token ?? null;
    if (freshToken) {
      token = freshToken;
      response = await fetch(input, { ...init, headers: buildHeaders(freshToken) });
    }
  }

  return response;
}
