import Foundation
import AVFoundation
let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer { try? FileManager.default.removeItem(at:directory) }
let writer=try SegmentedAudio(directory:directory)
let rate=24000.0,format=AVAudioFormat(standardFormatWithSampleRate:24000,channels:1)!
var frame=0
let total=Int(601*rate)
while frame<total {
    let n=min(4096,total-frame),b=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:AVAudioFrameCount(n))!
    b.frameLength=AVAudioFrameCount(n)
    for i in 0..<n { b.floatChannelData![0][i]=Float(sin(Double(frame+i)*2*Double.pi*440/rate)*0.15) }
    writer.append(b)
    if frame==0 { writer.setPaused(true);writer.append(b);writer.setPaused(false) }
    frame+=n
}
try writer.stop()
let (duration,parts,error)=writer.snapshot()
precondition(error==nil && duration==601)
precondition(parts.count==4)
let ends=[8.0,300.0,600.0,601.0]
var previous=0.0
for (i,p) in parts.enumerated() {
    precondition(p["start"] as! Double==previous && p["end"] as! Double==ends[i])
    let file=try AVAudioFile(forReading:directory.appendingPathComponent("\(i).m4a"))
    let actual=Double(file.length)/file.processingFormat.sampleRate
    precondition(abs(actual-(ends[i]-previous))<0.15,"segment duration mismatch: \(actual)")
    precondition((p["size"] as! Int)<24000000)
    previous=ends[i]
}
print("PASS: continuous 601-second synthetic audio, 8/300/600-second boundaries, pause exclusion, independently decodable AAC segments")
