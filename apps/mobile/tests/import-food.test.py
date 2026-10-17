import hashlib
import importlib.util
import json
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import closing

spec = importlib.util.spec_from_file_location('food_import', pathlib.Path(__file__).resolve().parents[1] / 'scripts/import-food.py')
food = importlib.util.module_from_spec(spec)
spec.loader.exec_module(food)


class ImportFoodTest(unittest.TestCase):
    def fixture(self, root):
        source = root / 'source'
        (source / 'licenses').mkdir(parents=True)
        row = dict(id='one', source='overture', name='Phở Đậm', address='Quận 10, VN', latitude=10.77, longitude=106.67, taxonomy={'primary': 'restaurant', 'hierarchy': ['restaurant']}, operating_status=None, release='2026-09-23.1', sources=[{'dataset': 'fixture', 'license': 'test'}], licenses=['test'], classification='restaurant', dishes=None, price_vnd=None, opening_hours=None, google_place_id=None)
        values = {'venues.json': [row], 'venues.csv': 'fixture', 'needs-review.json': [{**row, 'id': 'review-only'}], 'sources-and-licenses.json': {'source_licenses': {'test': 'fixture'}}}
        for name, value in values.items():
            (source / name).write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        (source / 'licenses/test.txt').write_bytes(b'license\r\nfixture\r\n')
        report = {'venues': 1, 'release': '2026-09-23.1', 'files': {n: hashlib.sha256((source / n).read_bytes()).hexdigest() for n in values}, 'source_config': {'boundary_metadata': {'scope': 'hcm-pre-2025'}, 'license_hashes': {'test.txt': hashlib.sha256(b'license\nfixture\n').hexdigest()}}}
        (source / 'run-report.json').write_text(json.dumps(report), encoding='utf-8')
        return source

    def test_repeated_import_and_ledger_isolation(self):
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent) as tmp:
            root = pathlib.Path(tmp)
            source = self.fixture(root)
            ledger = root / 'sovi.sqlite'
            ledger.write_bytes(b'private financial fixture')
            before = ledger.read_bytes()
            output = root / 'asset/sovi-food-fixture.db'
            food.import_food(source, output)
            food.import_food(source, output)
            with closing(sqlite3.connect(output)) as db:
                self.assertEqual(db.execute('select count(*) from venues').fetchone()[0], 1)
                self.assertEqual(db.execute('select key from venues').fetchone()[0], 'overture:one')
                self.assertEqual(db.execute('select count(*) from venue_search').fetchone()[0], 1)
                self.assertEqual(db.execute("select count(*) from venue_search where venue_search match 'name: dam'").fetchone()[0], 1)
            self.assertEqual(ledger.read_bytes(), before)
            with self.assertRaises(ValueError):
                food.import_food(source, ledger)
            with self.assertRaisesRegex(ValueError, 'read-only'):
                food.import_food(source, source / 'sovi-food-fixture.db')
            (source / 'venues.json').write_text('[]', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                food.import_food(source, output)
            with closing(sqlite3.connect(output)) as db:
                self.assertEqual(db.execute('select count(*) from venues').fetchone()[0], 1)

    def test_areas(self):
        self.assertIn('quan 10', food.areas('123 Street, District 10, VN'))
        self.assertIn('binh chanh', food.areas('123 đường A, Huyện Bình Chánh, VN'))
        self.assertIn('thu duc', food.areas('123 đường A, Thành phố Thủ Đức, VN'))


if __name__ == '__main__':
    unittest.main()
