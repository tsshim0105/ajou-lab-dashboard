import Foundation
import AVFoundation

// One continuous microphone tap; only the file writer rotates, at exact sample boundaries.
// All writer state is protected because the audio callback is not on the main thread.
final class SegmentedAudio: @unchecked Sendable {
    private let lock = NSLock()
    private let directory: URL
    private var file: AVAudioFile?
    private var format: AVAudioFormat?
    private var frames: Int64 = 0
    private var partStart: Int64 = 0
    private var nextBoundary: Int64 = 0
    private var items: [[String: Any]] = []
    private var paused = false
    private var finished = false
    private var failure: String?
    init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }
    func setPaused(_ value: Bool) { lock.lock(); defer { lock.unlock() }; paused = value }
    func snapshot() -> (Double, [[String: Any]], String?) {
        lock.lock(); defer { lock.unlock() }
        return (Double(frames) / (format?.sampleRate ?? 1), items, failure)
    }
    private func open(_ input: AVAudioFormat) throws {
        format = input
        if nextBoundary == 0 { nextBoundary = Int64(input.sampleRate * 8) } // Professor reference, processed with first five minutes.
        file = try AVAudioFile(forWriting: directory.appendingPathComponent("\(items.count).m4a"), settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: input.sampleRate, AVNumberOfChannelsKey: input.channelCount, AVEncoderBitRateKey: 64000], commonFormat: .pcmFormatFloat32, interleaved: false)
    }
    private func closePart() throws {
        file = nil // Finalize the container before making it visible to the upload bridge.
        guard frames > partStart, let format else { return }
        let path = directory.appendingPathComponent("\(items.count).m4a")
        let size = (try FileManager.default.attributesOfItem(atPath: path.path)[.size] as? NSNumber)?.intValue ?? 0
        items.append(["part": items.count, "start": Double(partStart)/format.sampleRate, "end": Double(frames)/format.sampleRate, "size": size])
        try JSONSerialization.data(withJSONObject: ["parts": items, "duration": Double(frames)/format.sampleRate]).write(to: directory.appendingPathComponent("manifest.json"), options: .atomic)
        partStart = frames
        nextBoundary = Int64((floor(Double(frames)/format.sampleRate/300)+1)*300*format.sampleRate)
    }
    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard !paused, !finished, failure == nil else { return }
        do {
            var offset = 0
            while offset < Int(buffer.frameLength) {
                if file == nil { try open(buffer.format) }
                guard let source = buffer.floatChannelData, let format else { throw NSError(domain:"Recording",code:1,userInfo:[NSLocalizedDescriptionKey:"지원하지 않는 마이크 형식입니다."]) }
                let count = min(Int(buffer.frameLength)-offset, Int(nextBoundary-frames))
                guard count > 0, let slice = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)), let target = slice.floatChannelData else { throw NSError(domain:"Recording",code:2) }
                slice.frameLength = AVAudioFrameCount(count)
                for channel in 0..<Int(format.channelCount) { target[channel].update(from: source[channel].advanced(by:offset), count:count) }
                try file?.write(from:slice)
                frames += Int64(count); offset += count
                if frames == nextBoundary { try closePart() }
            }
        } catch { failure = error.localizedDescription }
    }
    func stop() throws {
        lock.lock(); defer { lock.unlock() }
        guard !finished else { return }; finished = true
        try closePart()
        if let failure { throw NSError(domain:"Recording",code:3,userInfo:[NSLocalizedDescriptionKey:failure]) }
    }
}
