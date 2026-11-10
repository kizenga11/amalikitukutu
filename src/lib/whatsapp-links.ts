// ---------------------------------------------------------------------------
// WhatsApp links appended to the results SMS.
//
// The values live in academic_settings so the school can change them from the
// Settings page. This module is shared by the settings UI (school-api.ts) and
// the results SMS builder (app/api/sms/route.ts), so both always use the same
// keys and the same message wording.
// ---------------------------------------------------------------------------

/** academic_settings key for the WhatsApp link where results are posted. */
export const RESULTS_WHATSAPP_LINK_KEY = "results_whatsapp_link";

/** academic_settings key for the school parents' WhatsApp group invite link. */
export const PARENTS_WHATSAPP_GROUP_KEY = "parents_whatsapp_group_link";

export interface WhatsappLinks {
  /** WhatsApp link where parents can open the full results. */
  results: string;
  /** Invite link for the school parents' WhatsApp group. */
  parentsGroup: string;
}

export const DEFAULT_WHATSAPP_LINKS: WhatsappLinks = {
  results: "",
  parentsGroup: "",
};

/**
 * Extra text appended to a results SMS: a link for parents to open the results
 * on WhatsApp and an invite link for the school parents' group. Each sentence
 * is only included when its link is configured, and nothing is added when both
 * links are empty (the SMS stays exactly as it was before).
 */
export function whatsappLinksSmsSuffix(links: WhatsappLinks): string {
  const results = links.results.trim();
  const parentsGroup = links.parentsGroup.trim();
  const parts: string[] = [];
  if (results) parts.push(`Tazama matokeo kamili kwenye WhatsApp: ${results}`);
  if (parentsGroup) parts.push(`Bonyeza link ifuatayo kujiunga na kundi la wazazi la shule: ${parentsGroup}`);
  return parts.length > 0 ? `. ${parts.join(". ")}` : "";
}
