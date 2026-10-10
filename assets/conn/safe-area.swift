import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// Places Icon Composer's full-bleed macOS render in the classic pre-Tahoe safe area:
// an 824x824 body centered on a 1024x1024 transparent canvas, with a soft drop shadow.
// usage: swift safe-area.swift in.png out.png
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let size = 1024, body = 824, inset = (size - body) / 2
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
// CG shadow blur = 2 * gaussian sigma. Fitted to upstream: sigma 14, offset 6px down, opacity 0.27.
ctx.setShadow(offset: CGSize(width: 0, height: -6), blur: 32, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.28))
ctx.draw(img, in: CGRect(x: inset, y: inset, width: body, height: body))
let out = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, out, nil)
precondition(CGImageDestinationFinalize(dest))
