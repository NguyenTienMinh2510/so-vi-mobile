"""Run the actual verifier in a disposable Darwin directory with a full-size sparse file."""
import hashlib, subprocess, tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
native = root / 'modules/so-vi-native/ios/ModelFileVerifier.swift'
source = native.read_text()
lookup = 'fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false)'
assert source.count(lookup) == 2, 'Unexpected document lookup; do not bypass file guards'
# Only relocate the two OS document lookups; verify/hash/path checks stay intact.
source = source.replace('try ' + lookup, 'URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)')
with tempfile.TemporaryDirectory(prefix='sovi-model-memory-') as directory:
    scratch = Path(directory)
    derived = scratch / 'ModelFileVerifier.swift'
    derived.write_text(source)
    executable = scratch / 'model-memory-check'
    subprocess.run(['swiftc', '-O', '-swift-version', '5', str(derived), str(root/'tests/native-model-memory-check.swift'), '-o', str(executable)], check=True)
    print('Actual native verifier source SHA256:', hashlib.sha256(native.read_bytes()).hexdigest(), flush=True)
    subprocess.run([str(executable), str(scratch/'Documents')], check=True)
