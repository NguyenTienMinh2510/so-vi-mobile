#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export CI=1 EXPO_NO_TELEMETRY=1
# SDK 57 supports Xcode 26.4+; keep 26.x until this app adopts the Xcode 27 scene changes.
export DEVELOPER_DIR="/Applications/Xcode_26.6.app/Contents/Developer"
test -d "$DEVELOPER_DIR"
xcodebuild -version
test "$(xcodebuild -version | awk '/Xcode/{print $2}')" = "26.6"

npm test
npm run typecheck
build_root="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sovi-build.XXXXXX")"
swiftc -swift-version 5 modules/so-vi-native/ios/NativeInboxQueue.swift tests/native-queue-check.swift -o "$build_root/queue-check"
"$build_root/queue-check"

npx --no-install expo prebuild --platform ios --no-install
shopt -s nullglob
projects=(ios/*.xcodeproj)
test "${#projects[@]}" = 1
scheme="$(basename "${projects[0]}" .xcodeproj)"
test -f "ios/$scheme/SoViImportIntent.swift"
(cd ios && pod install)
test -d "ios/$scheme.xcworkspace"
xcodebuild -workspace "ios/$scheme.xcworkspace" -scheme "$scheme" \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$build_root/DerivedData" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO build

apps=("$build_root/DerivedData/Build/Products/Release-iphoneos/"*.app)
test "${#apps[@]}" = 1
app="${apps[0]}"
test -s "$app/main.jsbundle"
test -d "$app/Metadata.appintents"
test -n "$(find "$app/Metadata.appintents" -type f -size +0c -print -quit)"
executable="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")"
lipo "$app/$executable" -verify_arch arm64
mkdir -p "$build_root/Payload" build-artifacts
ditto "$app" "$build_root/Payload/$(basename "$app")"
(cd "$build_root" && /usr/bin/zip -qry so-vi-unsigned.ipa Payload)
cp "$build_root/so-vi-unsigned.ipa" build-artifacts/so-vi-unsigned.ipa
shasum -a 256 build-artifacts/so-vi-unsigned.ipa > build-artifacts/so-vi-unsigned.ipa.sha256
