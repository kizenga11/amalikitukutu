import { supabase } from "./supabase";

// The app keeps its Supabase session in localStorage (client-side), so server
// route handlers cannot read it from cookies. Attach the access token as a
// bearer token so the API routes can authenticate the caller.
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
