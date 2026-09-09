// Render through IconServices, rather than guessing macOS mask or padding.
// Used both to build the development Dock bitmap and to inspect app bundles.
import AppKit

guard CommandLine.arguments.count == 3 else {
    fatalError("usage: render-macos-icon.swift <bundle.app> <output.png>")
}
let icon = NSWorkspace.shared.icon(forFile: CommandLine.arguments[1])
let pixels = 1024
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Cannot create the icon rendering context")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
icon.draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels),
          from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Cannot encode the rendered icon")
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
