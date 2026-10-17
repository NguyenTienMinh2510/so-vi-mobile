import copy
import hashlib
import os
from pathlib import Path
import plistlib
import sys
import tempfile
import zipfile

ORIGINAL_SHA256 = "9c1db2adda18950a766fda780b902fd159ce2c600fabae383c8dc3508ebee36f"
PLIST_PATH = "Payload/SV.app/Info.plist"
ZIP_FIELDS = ("filename", "date_time", "compress_type", "comment", "extra", "create_system", "create_version", "extract_version", "reserved", "flag_bits", "volume", "internal_attr", "external_attr")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def repack(original, output):
    original = Path(original).resolve()
    output = Path(output).resolve()
    require(original != output and not output.exists(), "Output must be a new file, separate from the original IPA.")
    require(hashlib.sha256(original.read_bytes()).hexdigest() == ORIGINAL_SHA256, "Original IPA checksum does not match the verified build.")
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="sovi-name-", suffix=".ipa", dir=output.parent)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(original) as source:
            require(source.testzip() is None, "Original IPA failed CRC validation.")
            entries = source.infolist()
            require(len({item.filename for item in entries}) == len(entries), "Duplicate ZIP entries are not supported.")
            require(PLIST_PATH in source.namelist(), "Expected app Info.plist is missing.")
            old_data = source.read(PLIST_PATH)
            old_plist = plistlib.loads(old_data)
            require(old_plist.get("CFBundleDisplayName") == "Sổ Ví", "Unexpected original launcher name.")
            changed = dict(old_plist, CFBundleDisplayName="So Vi")
            new_data = plistlib.dumps(changed, fmt=plistlib.FMT_BINARY if old_data.startswith(b"bplist") else plistlib.FMT_XML, sort_keys=False)
            with zipfile.ZipFile(temporary, "w") as target:
                target.comment = source.comment
                for item in entries:
                    target.writestr(copy.copy(item), new_data if item.filename == PLIST_PATH else source.read(item))
            with zipfile.ZipFile(temporary) as target:
                require(target.testzip() is None, "Repacked IPA failed CRC validation.")
                require(target.namelist() == source.namelist() and target.comment == source.comment, "ZIP entries or comment changed.")
                for before, after in zip(entries, target.infolist()):
                    require(all(getattr(before, field) == getattr(after, field) for field in ZIP_FIELDS), "ZIP metadata changed: " + before.filename)
                    if before.filename == PLIST_PATH:
                        require(plistlib.loads(target.read(after)) == changed, "Launcher-name update was not exact.")
                    else:
                        require(before.CRC == after.CRC and before.file_size == after.file_size and source.read(before) == target.read(after), "An unrelated app entry changed: " + before.filename)
        require(not output.exists(), "Output appeared during repack; refusing to overwrite it.")
        os.replace(temporary, output)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        checksum = output.with_suffix(output.suffix + ".sha256")
        with checksum.open("x", encoding="ascii") as file:
            file.write(digest + "  " + output.name + "\n")
        print(digest + "  " + output.name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    require(len(sys.argv) == 3, "Usage: repack-ios-name.py ORIGINAL_IPA OUTPUT_IPA")
    repack(sys.argv[1], sys.argv[2])
