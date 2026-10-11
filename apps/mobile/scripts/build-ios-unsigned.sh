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
swiftc -swift-version 5 modules/so-vi-native/ios/OCRCachePaths.swift tests/native-ocr-cache-check.swift -o "$build_root/ocr-cache-check"
"$build_root/ocr-cache-check"
swiftc -swift-version 5 modules/so-vi-native/ios/NativeInboxQueue.swift modules/so-vi-native/ios/SharedInboxQueue.swift tests/shared-inbox-check.swift -o "$build_root/shared-inbox-check"
"$build_root/shared-inbox-check"

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
# Ad-hoc signatures carry capability requests for SideStore to discover. No Apple identity or profile is used.
parent_entitlements=("ios/$scheme/"*.entitlements)
test "${#parent_entitlements[@]}" = 1
test -d "$app/PlugIns/SoViWidget.appex"
test -d "$app/PlugIns/SoViShare.appex"
extensions=("$app/PlugIns/"*.appex)
test "${#extensions[@]}" = 2
# Sign any embedded runtime frameworks first, from the innermost bundle outward.
while IFS= read -r -d '' runtime; do
  codesign --force --sign - --timestamp=none "$runtime"
done < <(find "$app" -depth \( -name '*.framework' -o -name '*.dylib' \) -print0)
codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements ios/SoViWidget/SoViWidget.entitlements "$app/PlugIns/SoViWidget.appex"
codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements ios/SoViShare/SoViShare.entitlements "$app/PlugIns/SoViShare.appex"
codesign --force --sign - --timestamp=none --generate-entitlement-der --entitlements "${parent_entitlements[0]}" "$app"
codesign --verify --deep --strict "$app"
python3 - "$app" <<'PY'
import pathlib, plistlib, re, subprocess, sys
app = pathlib.Path(sys.argv[1])
group = 'group.local.sovi.moneytracker'
expected = [(app, 'local.sovi.moneytracker', 'So Vi', None, [group]),
            (app / 'PlugIns/SoViWidget.appex', 'local.sovi.moneytracker.widget', 'So Vi Widget', 'com.apple.widgetkit-extension', []),
            (app / 'PlugIns/SoViShare.appex', 'local.sovi.moneytracker.share', 'Share to So Vi', 'com.apple.share-services', [group])]
for bundle, identity, display, point, groups in expected:
    properties = plistlib.loads((bundle / 'Info.plist').read_bytes())
    assert properties['CFBundleIdentifier'] == identity
    assert properties['CFBundleDisplayName'] == display and display.isascii()
    assert properties['CFBundleShortVersionString'] == '0.1.1' and properties['CFBundleVersion'] == '2'
    assert not (bundle / 'embedded.mobileprovision').exists(), 'No Apple provisioning profile is packaged'
    binary = bundle / properties['CFBundleExecutable']
    subprocess.run(['lipo', str(binary), '-verify_arch', 'arm64'], check=True)
    platform = subprocess.check_output(['xcrun', 'vtool', '-show-build', str(binary)], text=True)
    assert re.search(r'^\s*platform\s+IOS\s*$', platform, re.MULTILINE), platform
    signed = subprocess.check_output(['codesign', '-d', '--entitlements', ':-', str(bundle)], stderr=subprocess.DEVNULL)
    entitlements = plistlib.loads(signed)
    assert entitlements.get('com.apple.security.application-groups', []) == groups
    if point:
        assert properties['NSExtension']['NSExtensionPointIdentifier'] == point
    if groups:
        assert properties['SoViBaseAppGroup'] == group
        assert properties['SoViParentBundleIdentifier'] == 'local.sovi.moneytracker'
assert (app / 'main.jsbundle').stat().st_size > 0
assert (app / 'Assets.car').stat().st_size > 0, 'Compiled app icon assets must be included'
assert any(path.is_file() and path.stat().st_size for path in (app / 'Metadata.appintents').rglob('*'))
print('PASS: iOS arm64 app + two extensions, versions/ASCII identities/icon/JS/AppIntent metadata, ad-hoc requested App Groups')
PY
mkdir -p "$build_root/Payload" build-artifacts
ditto "$app" "$build_root/Payload/$(basename "$app")"
(cd "$build_root" && /usr/bin/zip -qry so-vi-unsigned.ipa Payload)
cp "$build_root/so-vi-unsigned.ipa" build-artifacts/so-vi-unsigned.ipa
shasum -a 256 build-artifacts/so-vi-unsigned.ipa > build-artifacts/so-vi-unsigned.ipa.sha256
