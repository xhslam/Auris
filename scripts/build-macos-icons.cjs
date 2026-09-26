// macOS master: 1024px, opaque, full bleed, no baked outer mask or border.
// The system supplies the icon's mask and visual size. Never resize the inner
// artwork to compensate for a stale Dock cache or pad the bundle icon twice.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const sharp = require("sharp");
const { buildWindowsIcon } = require("./build-windows-icon.cjs");

async function main() {
  if (process.platform !== "darwin") throw new Error("Requires macOS iconutil");
  const assets = path.resolve(__dirname, "../assets");
  const source = path.join(assets, "app-icon-macos-master.png");
  const metadata = await sharp(source).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024) {
    throw new Error("The macOS master must be 1024 × 1024");
  }
  const stats = await sharp(source).stats();
  if (!stats.isOpaque) throw new Error("The macOS master must be opaque");
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "auris-icons-"));
  try {
    const iconset = path.join(work, "Auris.iconset");
    await fs.mkdir(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await sharp(source)
          .resize(size * scale, size * scale)
          .png().toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`));
      }
    }
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(work, "app-icon.icns")]);
    // Development setIcon() bypasses the bundle renderer. Bake the system's
    // actual rendition for it, including its own padding, exactly once.
    const bundle = path.join(work, "AurisIconPreview.app");
    await fs.mkdir(path.join(bundle, "Contents", "Resources"), { recursive: true });
    await fs.mkdir(path.join(bundle, "Contents", "MacOS"));
    await fs.copyFile("/usr/bin/true", path.join(bundle, "Contents", "MacOS", "Preview"));
    await fs.copyFile(path.join(work, "app-icon.icns"), path.join(bundle, "Contents", "Resources", "icon.icns"));
    await fs.writeFile(path.join(bundle, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.auris.icon-preview</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>Preview</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
</dict></plist>`);
    execFileSync("swift", [path.join(__dirname, "render-macos-icon.swift"), bundle, path.join(work, "app-icon-dock.png")]);
    for (const name of ["app-icon.icns", "app-icon-dock.png"]) {
      await fs.copyFile(path.join(work, name), path.join(assets, name));
    }
    await fs.copyFile(source, path.join(assets, "app-icon.png"));
    await buildWindowsIcon(source, path.join(assets, "app-icon-win.png"));
    for (const [relativePath, size] of [
      ["../src/app/icon.png", 512],
      ["../src/app/apple-icon.png", 180],
    ]) {
      await sharp(source)
        .resize(size, size)
        .png()
        .toFile(path.resolve(__dirname, relativePath));
    }
    console.log("Built macOS, Windows, web, and development Dock icons.");
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
