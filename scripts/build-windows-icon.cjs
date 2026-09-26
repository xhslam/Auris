const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const SIZE = 1024;
const TILE_SIZE = 832;
const TILE_OFFSET = (SIZE - TILE_SIZE) / 2;
const CORNER_RADIUS = 190;

async function buildWindowsIcon(sourcePath, outputPath) {
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== SIZE || metadata.height !== SIZE) {
    throw new Error("Windows icon source must be a 1024 × 1024 image");
  }

  // Preserve the original Auris artwork (white tile with the blue/cyan A mark),
  // while scaling the whole tile to the same footprint as the Windows icon mask.
  const tile = await sharp(sourcePath)
    .resize(TILE_SIZE, TILE_SIZE, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" rx="${CORNER_RADIUS}" fill="#fff"/></svg>`);
  const roundedTile = await sharp(tile)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const transparentCanvas = Buffer.from(`<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg"/>`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(transparentCanvas)
    .composite([{ input: roundedTile, left: TILE_OFFSET, top: TILE_OFFSET }])
    .png()
    .toFile(outputPath);

  return { width: SIZE, height: SIZE, tileSize: TILE_SIZE, offset: TILE_OFFSET, cornerRadius: CORNER_RADIUS };
}

if (require.main === module) {
  const assets = path.resolve(__dirname, "../assets");
  const sourcePath = path.join(assets, "app-icon-macos-master.png");
  const outputPath = path.join(assets, "app-icon-win.png");
  buildWindowsIcon(sourcePath, outputPath)
    .then((result) => console.log(`Built ${outputPath}: ${JSON.stringify(result)}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { buildWindowsIcon };
