export const CERTIFICATE_SIGNATURE_KEYS = {
  head: "amali.certificate.signature.head",
  academic: "amali.certificate.signature.academic",
} as const;

export type CertificateSigner = keyof typeof CERTIFICATE_SIGNATURE_KEYS;

export function loadCertificateSignature(signer: CertificateSigner): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CERTIFICATE_SIGNATURE_KEYS[signer]) ?? "";
  } catch {
    return "";
  }
}

export function saveCertificateSignature(signer: CertificateSigner, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(CERTIFICATE_SIGNATURE_KEYS[signer], value);
    else window.localStorage.removeItem(CERTIFICATE_SIGNATURE_KEYS[signer]);
  } catch {
    // Ignore storage failures (private mode, quota) — the signature still shows on screen.
  }
}
