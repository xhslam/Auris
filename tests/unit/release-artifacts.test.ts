import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { stringify } from "yaml";
const { verifyReleaseArtifacts } = createRequire(import.meta.url)("../../scripts/verify-release-artifacts.cjs");
let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "auris-release-")); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
function fixture(name = "latest.yml", url = "Auris-1.0.27-win-x64.exe") {
  const content = Buffer.from("test installer");
  fs.writeFileSync(path.join(directory, url), content);
  const metadata = { version: "1.0.27", files: [{ url, size: content.length, sha512: createHash("sha512").update(content).digest("base64") }] };
  fs.writeFileSync(path.join(directory, name), stringify(metadata));
  return metadata;
}
it("verifies both platforms with their actual metadata and files", async () => {
  fixture(); fixture("latest-mac.yml", "Auris-1.0.27-arm64-mac.zip");
  fs.writeFileSync(path.join(directory, "Auris-1.0.27-arm64.dmg"), "dmg");
  await expect(verifyReleaseArtifacts(directory, "1.0.27", ["latest.yml", "latest-mac.yml"])).resolves.toBeUndefined();
});
it("blocks mismatched versions, missing assets, and corrupted downloads", async () => {
  fixture();
  await expect(verifyReleaseArtifacts(directory, "1.0.28", ["latest.yml"])).rejects.toThrow("version mismatch");
  fs.writeFileSync(path.join(directory, "Auris-1.0.27-win-x64.exe"), "fake installer");
  await expect(verifyReleaseArtifacts(directory, "1.0.27", ["latest.yml"])).rejects.toThrow("SHA-512 mismatch");
  fs.unlinkSync(path.join(directory, "Auris-1.0.27-win-x64.exe"));
  await expect(verifyReleaseArtifacts(directory, "1.0.27", ["latest.yml"])).rejects.toThrow();
});
it("blocks path escapes and mac releases without an initial installer", async () => {
  const metadata = fixture(); metadata.files[0].url = "../escape.exe";
  fs.writeFileSync(path.join(directory, "latest.yml"), stringify(metadata));
  await expect(verifyReleaseArtifacts(directory, "1.0.27", ["latest.yml"])).rejects.toThrow("unsafe");
  fixture("latest-mac.yml", "Auris-1.0.27-arm64-mac.zip");
  await expect(verifyReleaseArtifacts(directory, "1.0.27", ["latest-mac.yml"])).rejects.toThrow("DMG");
});
