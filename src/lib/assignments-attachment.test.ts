import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentTypeForFile,
  attachmentTypeForName,
  dataUrlWithType,
  normaliseAttachment,
} from "./assignments-shared";

describe("attachmentTypeForFile", () => {
  it("uses an explicit supported MIME type", () => {
    expect(attachmentTypeForFile({ name: "answer.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(attachmentTypeForFile({ name: "photo.PNG", type: "IMAGE/PNG" })).toBe("image/png");
  });

  it("falls back to the extension when Android reports no usable type", () => {
    expect(attachmentTypeForFile({ name: "answer.pdf", type: "" })).toBe("application/pdf");
    expect(attachmentTypeForFile({ name: "answer.pdf", type: "application/octet-stream" })).toBe("application/pdf");
    expect(attachmentTypeForFile({ name: "Jibu la Mtihani.PDF", type: "" })).toBe("application/pdf");
  });

  it("supports the image extensions used by the upload dialog", () => {
    expect(attachmentTypeForName("a.jpeg")).toBe("image/jpeg");
    expect(attachmentTypeForName("a.webp")).toBe("image/webp");
    expect(attachmentTypeForName("a.gif")).toBe("image/gif");
  });

  it("returns an empty string for unsupported files", () => {
    expect(attachmentTypeForFile({ name: "virus.exe", type: "" })).toBe("");
    expect(attachmentTypeForFile({ name: "no-extension", type: "application/zip" })).toBe("");
  });
});

describe("dataUrlWithType", () => {
  it("repairs a data URL whose MIME type the browser omitted", () => {
    expect(dataUrlWithType("data:;base64,JVBERi0=", "application/pdf")).toBe(
      "data:application/pdf;base64,JVBERi0=",
    );
  });

  it("replaces a generic type with the validated one", () => {
    expect(dataUrlWithType("data:application/octet-stream;base64,JVBERi0=", "application/pdf")).toBe(
      "data:application/pdf;base64,JVBERi0=",
    );
  });

  it("keeps the payload intact and ignores unknown input safely", () => {
    expect(dataUrlWithType("data:image/png;base64,iVBORw0", "image/png")).toBe("data:image/png;base64,iVBORw0");
    expect(dataUrlWithType("not a data url", "application/pdf")).toBe("not a data url");
  });
});

describe("normaliseAttachment", () => {
  it("accepts a PDF whose data URL has no MIME type", () => {
    const result = normaliseAttachment({
      name: "jibu.pdf",
      type: "",
      data: "data:;base64,JVBERi0xLjQK",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.attachment).toEqual({
      name: "jibu.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
    });
  });

  it("accepts a generic browser type when the file name is a PDF", () => {
    const result = normaliseAttachment({
      name: "jibu.PDF",
      type: "application/octet-stream",
      data: "data:application/octet-stream;base64,JVBERi0xLjQK",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.attachment?.type).toBe("application/pdf");
  });

  it("still rejects files that are neither PDFs nor supported images", () => {
    const result = normaliseAttachment({
      name: "jibu.exe",
      type: "",
      data: "data:;base64,TVg=",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Unsupported file type/);
  });

  it("still enforces the size limit", () => {
    const bigBase64 = "A".repeat(Math.ceil(((ATTACHMENT_MAX_BYTES + 1) * 4) / 3));
    const result = normaliseAttachment({
      name: "jibu.pdf",
      type: "application/pdf",
      data: `data:application/pdf;base64,${bigBase64}`,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/too large/);
  });
});
