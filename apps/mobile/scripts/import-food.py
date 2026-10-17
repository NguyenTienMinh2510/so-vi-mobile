"""Verify the handed-off export and import ONLY accepted venues into a separate asset."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import sqlite3
import unicodedata


def normalize(value):
    return re.sub(r"\s+", " ", "".join(c for c in unicodedata.normalize("NFD", value.lower().replace("đ", "d")) if unicodedata.category(c) != "Mn")).strip()


def areas(address):
    text = normalize(address)
    text = re.sub(r"\b(?:district|q\.?)\s*(\d+)\b", r"quan \1", text)
    found = {"ho chi minh"}  # All accepted records are inside the manifest's historic HCM polygon.
    for part in re.split(r"[,;]", text):
        part = part.strip()
        if re.match(r"^(quan|huyen|thanh pho|phuong|xa|thi xa|thu duc|binh thanh|go vap|tan binh|tan phu|phu nhuan|binh tan)\b", part):
            found.add(re.sub(r"^(?:quan (?!\d)|huyen |thanh pho )", "", part))
    found.update(re.findall(r"\bquan \d+\b", text))
    return sorted(found)


def verify_export(source):
    report = json.loads((source / "run-report.json").read_text(encoding="utf-8"))
    required = {"venues.csv", "venues.json", "needs-review.json", "sources-and-licenses.json"}
    if set(report["files"]) != required or report["source_config"]["boundary_metadata"]["scope"] != "hcm-pre-2025":
        raise ValueError("Unexpected export files or geographic scope")
    verification = {}
    for name, expected in list(report["files"].items()) + [("licenses/" + n, h) for n, h in report["source_config"]["license_hashes"].items()]:
        target = (source / name).resolve()
        if not target.is_relative_to(source.resolve()) or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("Unsafe manifest entry")
        with target.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if actual != expected:
            # Exporter wrote license text with Windows newlines after hashing its source bytes.
            if not name.startswith("licenses/") or hashlib.sha256(target.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != expected:
                raise ValueError("SHA-256 mismatch: " + name)
        verification[name] = {"expected": expected, "actual": actual, "comparison": "exact" if actual == expected else "CRLF-to-LF"}
    report['_verification'] = verification
    return report


def import_food(source, destination):
    source, destination = pathlib.Path(source), pathlib.Path(destination)
    if destination.resolve().is_relative_to(source.resolve()):
        raise ValueError('Source export is read-only; choose an output outside it')
    if not re.fullmatch(r"sovi-food-[a-zA-Z0-9.-]+\.db", destination.name):
        raise ValueError("Food database must be named sovi-food-<release>.db; never use ledger database")
    report = verify_export(source)
    rows = json.loads((source / "venues.json").read_text(encoding="utf-8"))
    if len(rows) != report["venues"]:
        raise ValueError("Venue count differs from manifest")
    destination.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(destination)
    try:
        existing = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if existing - {"venues", "venue_areas", "metadata", "venue_search", "venue_search_data", "venue_search_idx", "venue_search_content", "venue_search_docsize", "venue_search_config"}:
            raise ValueError("Destination contains non-food tables")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS venues(key TEXT PRIMARY KEY, source TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, taxonomy TEXT NOT NULL, status TEXT, release TEXT NOT NULL, sources TEXT NOT NULL, licenses TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS venue_areas(area TEXT NOT NULL, venue_key TEXT NOT NULL, PRIMARY KEY(area,venue_key));
            CREATE INDEX IF NOT EXISTS venue_area_key ON venue_areas(venue_key);
            CREATE INDEX IF NOT EXISTS venue_position ON venues(lat,lon);
            CREATE VIRTUAL TABLE IF NOT EXISTS venue_search USING fts5(name,taxonomy,tokenize='unicode61 remove_diacritics 2');
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        """)
        with db:
            keys = set()
            for row in rows:
                key = row["source"] + ":" + row["id"]
                if key in keys or row["source"] != "overture" or row["release"] != report["release"] or row["classification"] != "restaurant" or not row["name"].strip() or not row["address"].strip() or not (8 <= row["latitude"] <= 24 and 102 <= row["longitude"] <= 110):
                    raise ValueError("Invalid or duplicate accepted venue: " + key)
                # This release has no verified menu, price, hours or Place ID. Do not silently promote future fields.
                if any(row.get(k) is not None for k in ["dishes", "price_vnd", "opening_hours", "google_place_id"]):
                    raise ValueError("New evidence fields need an explicit importer upgrade")
                keys.add(key)
                db.execute("INSERT INTO venues VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,address=excluded.address,lat=excluded.lat,lon=excluded.lon,taxonomy=excluded.taxonomy,status=excluded.status,release=excluded.release,sources=excluded.sources,licenses=excluded.licenses", (key, row["source"], row["id"], row["name"], row["address"], row["latitude"], row["longitude"], json.dumps(row["taxonomy"], ensure_ascii=False), row["operating_status"], row["release"], json.dumps(row["sources"], ensure_ascii=False), json.dumps(row["licenses"])))
                rowid = db.execute("SELECT rowid FROM venues WHERE key=?", (key,)).fetchone()[0]
                db.execute("DELETE FROM venue_search WHERE rowid=?", (rowid,))
                db.execute("INSERT INTO venue_search(rowid,name,taxonomy) VALUES(?,?,?)", (rowid, normalize(row["name"]), normalize(" ".join(row["taxonomy"].get("hierarchy") or []))))
                db.execute("DELETE FROM venue_areas WHERE venue_key=?", (key,))
                db.executemany("INSERT INTO venue_areas VALUES(?,?)", [(area, key) for area in areas(row["address"])])
            # Release-specific assets never accumulate stale rows from a different snapshot.
            if db.execute("SELECT count(*) FROM venues").fetchone()[0] != len(keys):
                raise ValueError("Destination has stale records; use a fresh release-specific food asset")
            db.execute("INSERT OR REPLACE INTO metadata VALUES('manifest',?)", (json.dumps(report, ensure_ascii=False),))
            documents = {name: (source / 'licenses' / name).read_bytes().decode('utf-8') for name in report['source_config']['license_hashes']}
            db.execute("INSERT OR REPLACE INTO metadata VALUES('license_documents',?)", (json.dumps(documents, ensure_ascii=False),))
            attribution = json.loads((source / 'sources-and-licenses.json').read_text(encoding='utf-8'))
            db.execute("INSERT OR REPLACE INTO metadata VALUES('source_licenses',?)", (json.dumps({k: v for k, v in attribution.items() if k != 'sources'}, ensure_ascii=False),))
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity check failed")
    finally:
        db.close()
    shutil.copyfile(source / 'run-report.json', destination.parent / 'run-report.json')
    (destination.parent / 'source-licenses.json').write_text(json.dumps({k: v for k, v in attribution.items() if k != 'sources'}, ensure_ascii=False, indent=2), encoding='utf-8')
    (destination.parent / 'verification.json').write_text(json.dumps(report['_verification'], indent=2), encoding='utf-8')
    shutil.copytree(source / "licenses", destination.parent / "licenses", dirs_exist_ok=True)
    return {"venues": len(rows), "release": report["release"], "database": str(destination), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "assets/food/sovi-food-2026-09-23.1.db")
    args = parser.parse_args()
    print(json.dumps(import_food(args.source, args.output), ensure_ascii=False))
