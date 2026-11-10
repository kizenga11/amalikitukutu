import { describe, expect, it } from "vitest";
import { whatsappLinksSmsSuffix } from "./whatsapp-links";

const RESULTS = "https://chat.whatsapp.com/results123";
const GROUP = "https://chat.whatsapp.com/group456";

describe("whatsappLinksSmsSuffix", () => {
  it("adds nothing when no links are configured", () => {
    expect(whatsappLinksSmsSuffix({ results: "", parentsGroup: "" })).toBe("");
    expect(whatsappLinksSmsSuffix({ results: "   ", parentsGroup: " " })).toBe("");
  });

  it("adds only the results sentence when only the results link is set", () => {
    expect(whatsappLinksSmsSuffix({ results: RESULTS, parentsGroup: "" })).toBe(
      `. Tazama matokeo kamili kwenye WhatsApp: ${RESULTS}`,
    );
  });

  it("adds only the parents' group sentence when only the group link is set", () => {
    expect(whatsappLinksSmsSuffix({ results: "", parentsGroup: GROUP })).toBe(
      `. Bonyeza link ifuatayo kujiunga na kundi la wazazi la shule: ${GROUP}`,
    );
  });

  it("adds both sentences when both links are set", () => {
    expect(whatsappLinksSmsSuffix({ results: RESULTS, parentsGroup: GROUP })).toBe(
      `. Tazama matokeo kamili kwenye WhatsApp: ${RESULTS}. Bonyeza link ifuatayo kujiunga na kundi la wazazi la shule: ${GROUP}`,
    );
  });

  it("ignores surrounding whitespace in the links", () => {
    expect(whatsappLinksSmsSuffix({ results: `  ${RESULTS}  `, parentsGroup: "" })).toBe(
      `. Tazama matokeo kamili kwenye WhatsApp: ${RESULTS}`,
    );
  });
});
