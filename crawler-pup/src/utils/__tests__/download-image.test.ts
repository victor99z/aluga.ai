import { describe, test, expect } from "bun:test";
import { DownloadImageAndCreateFile } from "../download-image";

describe("DownloadImageAndCreateFile", () => {
  test("returns null for empty or invalid URLs without throwing", async () => {
    expect(await DownloadImageAndCreateFile("")).toBeNull();
    expect(await DownloadImageAndCreateFile("   ")).toBeNull();
    expect(await DownloadImageAndCreateFile("not-a-valid-url")).toBeNull();
    expect(await DownloadImageAndCreateFile("ftp://example.com/a.jpg")).toBeNull();
  });
});
