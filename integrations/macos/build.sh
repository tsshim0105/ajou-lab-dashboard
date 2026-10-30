#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build/ModuleCache build/NISML.iconset
APP="$PWD/build/NISML Hub.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" Resources/AppIcon.png --out "build/NISML.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" Resources/AppIcon.png --out "build/NISML.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
python3 - <<'PYICON'
import struct
from pathlib import Path
chunks=[]
for kind,name in [('icp4','icon_16x16.png'),('icp5','icon_32x32.png'),('icp6','icon_32x32@2x.png'),('ic07','icon_128x128.png'),('ic08','icon_256x256.png'),('ic09','icon_512x512.png'),('ic10','icon_512x512@2x.png')]:
    data=Path('build/NISML.iconset',name).read_bytes()
    chunks.append(kind.encode()+struct.pack('>I',len(data)+8)+data)
body=b''.join(chunks)
Path('build/NISML Hub.app/Contents/Resources/AppIcon.icns').write_bytes(b'icns'+struct.pack('>I',len(body)+8)+body)
PYICON
cp Resources/Logo.png "$APP/Contents/Resources/Logo.png"
xcrun swiftc -swift-version 5 -O -target arm64-apple-macosx13.0 -module-cache-path "$PWD/build/ModuleCache" Sources/Core.swift Sources/SegmentedAudio.swift Sources/MeetingPanel.swift Sources/MeetingHotKey.swift Sources/main.swift -o "$APP/Contents/MacOS/NISMLDashboard" -framework AppKit -framework WebKit -framework UserNotifications -framework ServiceManagement -framework SwiftUI -framework AVFoundation -framework Carbon
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>kr.ac.ajou.nisml.dashboard.mac</string>
<key>CFBundleName</key><string>NISML Hub</string>
<key>CFBundleDisplayName</key><string>NISML Hub</string>
<key>CFBundleExecutable</key><string>NISMLDashboard</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.4.19</string>
<key>CFBundleVersion</key><string>27</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSMicrophoneUsageDescription</key><string>연구미팅을 녹음하고 회의 종료 후 전사와 요약을 작성합니다.</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
printf '%s\n' "$APP"
