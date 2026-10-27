import AppKit
let dir = URL(fileURLWithPath: CommandLine.arguments[1])
let macFullBleed = CommandLine.arguments.contains("--mac-full-bleed")
let out = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1024,pixelsHigh:1024,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:out)
NSGraphicsContext.current!.imageInterpolation = .high
let plate = NSImage(contentsOf:dir.appendingPathComponent("ceramic-backplate.png"))!
if macFullBleed {
    // macOS supplies the outer icon shape: provide an opaque edge-to-edge face.
    NSColor(srgbRed:0.90,green:0.95,blue:0.96,alpha:1).setFill()
    NSRect(x:0,y:0,width:1024,height:1024).fill()
    plate.draw(in:NSRect(x:0,y:0,width:1024,height:1024),from:NSRect(x:plate.size.width*0.17,y:plate.size.height*0.17,width:plate.size.width*0.66,height:plate.size.height*0.66),operation:.sourceOver,fraction:1)
} else {
    plate.draw(in:NSRect(x:0,y:0,width:1024,height:1024))
}
let logo = NSImage(contentsOf:dir.appendingPathComponent("original-logo.png"))!
let height:CGFloat=962.56, width=height*logo.size.width/logo.size.height
logo.draw(in:NSRect(x:(1024-width)/2,y:(1024-height)/2,width:width,height:height))
NSGraphicsContext.restoreGraphicsState()
try out.representation(using:.png,properties:[:])!.write(to:dir.appendingPathComponent(macFullBleed ? "hub-icon-mac-1024.png" : "hub-icon-1024.png"))

if macFullBleed {
    let foreground = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1024,pixelsHigh:1024,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:foreground)
    NSGraphicsContext.current!.imageInterpolation = .high
    logo.draw(in:NSRect(x:(1024-width)/2,y:(1024-height)/2,width:width,height:height))
    NSGraphicsContext.restoreGraphicsState()
    try foreground.representation(using:.png,properties:[:])!.write(to:dir.appendingPathComponent("hub-foreground.png"))
}
