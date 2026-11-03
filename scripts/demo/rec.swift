// Records the default microphone to a 48 kHz mono WAV with macOS's own recorder (AVAudioRecorder) until a line
// arrives on stdin. Used by voice.mjs: ffmpeg's avfoundation input dropped about 1 in 10 samples on this Mac,
// which made the voice sound choppy.
//
// Usage: swiftc -O scripts/demo/rec.swift -o private/video/rec && private/video/rec out.wav

import AVFoundation

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let settings: [String: Any] = [
  AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1,
  AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
]
let recorder = try AVAudioRecorder(url: url, settings: settings)
guard recorder.record() else {
  FileHandle.standardError.write("Could not start recording: check the microphone permission.\n".data(using: .utf8)!)
  exit(1)
}
print("recording")
fflush(stdout)
_ = readLine()
recorder.stop()
