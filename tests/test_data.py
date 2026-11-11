"""Validate original table extraction, cross-year headers and missing semantics."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fetch_data', ROOT / 'scripts/fetch_data.py')
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)


class DataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads((ROOT / 'data/housing.json').read_text(encoding='utf-8'))
        cls.sources = json.loads((ROOT / 'data/source_urls.json').read_text(encoding='utf-8'))

    def test_complete_panel(self):
        report = fetch.validate(self.rows)
        self.assertEqual(report['count'], 4620)
        self.assertEqual(report['missing_values'], 0)

    def test_year_boundary_original_tables(self):
        # Independently transcribed Beijing cells from official aggregate tables.
        expected = {
            '2024-01': {'new': (99.9, 101.3), 'resale': (99.3, 96.3)},
            '2025-01': {'new': (99.6, 94.3), 'resale': (100.1, 96.2)},
            '2026-01': {'new': (99.7, 97.6), 'resale': (99.8, 91.3)},
            '2026-09': {'new': (99.8, 97.3), 'resale': (100.1, 97.5)},
        }
        for month, types in expected.items():
            with self.subTest(month=month):
                html = (ROOT / 'raw' / f'{month}.html').read_text(encoding='utf-8')
                rows, _ = fetch.parse_month(html, month, self.sources[month])
                self.assertEqual(len(rows), 140)
                for kind, values in types.items():
                    row = next(r for r in rows if r['city'] == '北京' and r['type'] == kind)
                    self.assertEqual((row['mom_index'], row['yoy_index']), values)

    def test_missing_not_zero(self):
        for token in ('', '—', '-', '…', 'NA', 'N/A'):
            self.assertIsNone(fetch.number(token))
        self.assertEqual(fetch.number(' 100.0 '), 100)
        rows = copy.deepcopy(self.rows)
        rows[0]['mom_index'] = None
        self.assertEqual(fetch.validate(rows)['missing_values'], 1)

    def test_duplicate_rejected(self):
        with self.assertRaises(AssertionError):
            fetch.validate([*self.rows, self.rows[0]])

    def test_missing_city_rejected(self):
        with self.assertRaises(AssertionError):
            fetch.validate(self.rows[1:])

    def test_corrupt_value_rejected(self):
        rows = copy.deepcopy(self.rows)
        rows[0]['yoy_index'] = 999
        with self.assertRaises(AssertionError):
            fetch.validate(rows)

    def test_baseline_change_in_original(self):
        html = (ROOT / 'raw/2026-01.html').read_text(encoding='utf-8')
        _, text = fetch.parse_month(html, '2026-01', self.sources['2026-01'])
        compact = fetch.clean(text)
        self.assertIn('2025年作为新一轮对比基期', compact)
        self.assertIn('基本分类权数有所调整', compact)


if __name__ == '__main__':
    unittest.main()
