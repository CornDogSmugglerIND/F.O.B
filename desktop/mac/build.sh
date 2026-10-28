#!/bin/zsh
# Builds F.O.B Scan.app (Apple Silicon + Intel) and zips it for the F.O.B download link.
set -e
cd "$(dirname "$0")"
rm -rf build && mkdir -p "build/F.O.B Scan.app/Contents/MacOS" "build/F.O.B Scan.app/Contents/Resources"
swiftc -parse-as-library -O -target arm64-apple-macos14 FOBScan.swift -o build/arm64
swiftc -parse-as-library -O -target x86_64-apple-macos14 FOBScan.swift -o build/x86
lipo -create build/arm64 build/x86 -output "build/F.O.B Scan.app/Contents/MacOS/FOBScan"
cp Info.plist "build/F.O.B Scan.app/Contents/Info.plist"
[ -f AppIcon.icns ] && cp AppIcon.icns "build/F.O.B Scan.app/Contents/Resources/"
codesign --force --deep -s - "build/F.O.B Scan.app"
(cd build && ditto -c -k --keepParent "F.O.B Scan.app" "FOB-Scan-mac.zip")
echo built
