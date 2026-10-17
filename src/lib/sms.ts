// ---------------------------------------------------------------------------
// Africa's Talking SMS gateway (server-only).
//
// Configure these environment variables (see .env.example):
//   AFRICASTALKING_USERNAME   - your AT username ("sandbox" while testing)
//   AFRICASTALKING_API_KEY    - your AT API key
//   AFRICASTALKING_SENDER_ID  - optional alphanumeric sender id / short code
//
// This module must only be imported from server route handlers so the API key
// is never shipped to the browser.
// ---------------------------------------------------------------------------

const AT_SANDBOX_HOST = "https://api.sandbox.africastalking.com";
const AT_PRODUCTION_HOST = "https://api.africastalking.com";
const AT_SMS_PATH = "/version1/messaging";

// Africa's Talking accepts up to 1000 numbers per request; we keep batches
// smaller so one slow batch cannot stall the whole run.
const AT_BATCH_SIZE = 100;

export interface SmsDispatchItem {
  /** Normalised E.164 phone number, e.g. +255712345678. */
  phone: string;
  message: string;
  /** Opaque id echoed back with the result (e.g. the student id). */
  ref?: string;
}

export interface SmsDispatchResult {
  phone: string;
  ref?: string;
  ok: boolean;
  status: string;
  messageId?: string;
  error?: string;
}

interface RawRecipient {
  statusCode?: number | string;
  number?: string;
  cost?: string;
  status?: string;
  messageId?: string;
}

export function smsConfigured(): boolean {
  return Boolean(process.env.AFRICASTALKING_USERNAME && process.env.AFRICASTALKING_API_KEY);
}

// Normalise a Tanzanian number to E.164 (+255XXXXXXXXX). Accepts the common
// local formats (0712345678, 0712 345 678, +255712345678, 255712345678).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, "");
  let national: string | null = null;
  if (cleaned.startsWith("+255")) national = cleaned.slice(4);
  else if (/^255[67]\d{8}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^0[67]\d{8}$/.test(cleaned)) national = cleaned.slice(1);
  else if (/^[67]\d{8}$/.test(cleaned)) national = cleaned;
  if (!national || !/^[67]\d{8}$/.test(national)) return null;
  return `+255${national}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function postMessage(phones: string[], message: string): Promise<SmsDispatchResult[]> {
  const username = process.env.AFRICASTALKING_USERNAME!;
  const apiKey = process.env.AFRICASTALKING_API_KEY!;
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  const host = username.toLowerCase() === "sandbox" ? AT_SANDBOX_HOST : AT_PRODUCTION_HOST;

  const body = new URLSearchParams();
  body.set("username", username);
  body.set("to", phones.join(","));
  body.set("message", message);
  if (senderId) body.set("from", senderId);

  try {
    const res = await fetch(`${host}${AT_SMS_PATH}`, {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const text = await res.text();
    let data: { Message?: string; Recipients?: RawRecipient[] } | undefined;
    try {
      const parsed = JSON.parse(text) as { SMSMessageData?: { Message?: string; Recipients?: RawRecipient[] } };
      data = parsed.SMSMessageData;
    } catch {
      data = undefined;
    }
    const recipients = Array.isArray(data?.Recipients) ? data.Recipients : [];

    if (!res.ok) {
      const reason = data?.Message ?? text ?? `HTTP ${res.status}`;
      return phones.map((phone) => ({ phone, ok: false, status: "Failed", error: String(reason) }));
    }
    if (recipients.length === 0) {
      const reason = data?.Message ?? "No response from gateway";
      return phones.map((phone) => ({ phone, ok: false, status: "Failed", error: String(reason) }));
    }

    const byNumber = new Map<string, SmsDispatchResult>();
    const ordered: SmsDispatchResult[] = recipients.map((r) => {
      const status = r.status ?? "Unknown";
      const statusCode = Number(r.statusCode ?? 0);
      const ok = statusCode === 101 || /^success$/i.test(status);
      const result: SmsDispatchResult = {
        phone: r.number ?? "",
        ok,
        status,
        messageId: r.messageId,
        error: ok ? undefined : status,
      };
      const normalised = normalizePhone(r.number ?? "");
      if (normalised) byNumber.set(normalised, result);
      return result;
    });

    // Match each requested phone to the gateway response (fall back to order).
    return phones.map((phone, index) => {
      const matched = byNumber.get(phone) ?? ordered[index];
      return matched ? { ...matched, phone: matched.phone || phone } : { phone, ok: false, status: "Unknown" };
    });
  } catch (error) {
    const message_ = error instanceof Error ? error.message : "Network error";
    return phones.map((phone) => ({ phone, ok: false, status: "Failed", error: message_ }));
  }
}

// Send a set of (phone, message) pairs. Identical messages are grouped into a
// single gateway call so "same text to every parent" stays fast, while
// personalised result messages are sent one at a time.
export async function sendSmsBatch(
  items: SmsDispatchItem[],
  options: { concurrency?: number } = {},
): Promise<SmsDispatchResult[]> {
  if (!smsConfigured()) throw new Error("Africa's Talking is not configured.");
  if (items.length === 0) return [];

  const byMessage = new Map<string, SmsDispatchItem[]>();
  for (const item of items) {
    const list = byMessage.get(item.message) ?? [];
    list.push(item);
    byMessage.set(item.message, list);
  }

  const groups = Array.from(byMessage.entries());
  const results: SmsDispatchResult[] = [];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, 10));
  let cursor = 0;

  async function worker() {
    while (cursor < groups.length) {
      const [message, groupItems] = groups[cursor++];
      for (const batch of chunk(groupItems, AT_BATCH_SIZE)) {
        const phones = batch.map((item) => item.phone);
        const raw = await postMessage(phones, message);
        batch.forEach((item, index) => {
          const r = raw[index];
          results.push({
            phone: item.phone,
            ref: item.ref,
            ok: r?.ok ?? false,
            status: r?.status ?? "Unknown",
            messageId: r?.messageId,
            error: r?.error,
          });
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
