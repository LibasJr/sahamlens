"""Regresi parser dan empty-state sync-ksei-corporate-calendar.py.

Tidak menyentuh jaringan live. Menguji penanganan halaman kosong (awal bulan),
halaman bertabel, halaman tak dikenal (fail-closed), dan parser dokumen PDF.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / "sync-ksei-corporate-calendar.py"
SPEC = importlib.util.spec_from_file_location("sync_ksei_corporate_calendar", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


SAMPLE_EMPTY_PAGE = """
<html>
<head><title>KSEI</title></head>
<body>
<form id="IsinAnnouncementFilterDisplayPageForm">
    <select name="Month" id="IsinAnnouncementFilterMonth"><option value="11" selected>November</option></select>
    <select name="Year" id="IsinAnnouncementFilterYear"><option value="2026" selected>2026</option></select>
</form>
<p style="text-align: center; margin-top: 40px;">Belum ada data</p>
</body>
</html>
""".encode("utf-8")


SAMPLE_TABLE_PAGE = """
<html>
<body>
<form id="IsinAnnouncementFilterDisplayPageForm">
    <select name="Month" id="IsinAnnouncementFilterMonth"><option value="10">Oktober</option></select>
</form>
<table class="table table--zebra">
    <tbody>
        <tr>
            <td><a href="/download?file=12345">Download</a></td>
            <td>Pemberitahuan RUPS BBCA</td>
            <td>28/10/2026</td>
        </tr>
    </tbody>
</table>
</body>
</html>
""".encode("utf-8")


SAMPLE_CORRUPTED_PAGE = """
<html>
<body>
<h1>502 Bad Gateway</h1>
<p>The server encountered a temporary error.</p>
</body>
</html>
""".encode("utf-8")


class KseiCorporateCalendarTest(unittest.TestCase):
    def test_target_periods_handles_current_year(self):
        now = dt.datetime(2026, 11, 1, 8, 0)
        periods = MODULE.target_periods([2026], now)
        self.assertEqual(len(periods), 11)
        self.assertEqual(periods[0], (2026, 1))
        self.assertEqual(periods[-1], (2026, 11))

    def test_target_periods_handles_past_year(self):
        now = dt.datetime(2026, 11, 1, 8, 0)
        periods = MODULE.target_periods([2025], now)
        self.assertEqual(len(periods), 12)
        self.assertEqual(periods[-1], (2025, 12))

    def test_sync_month_empty_state_produces_valid_snapshot(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = Path(tmpdir)
            with patch.object(MODULE, "get", return_value=(SAMPLE_EMPTY_PAGE, "https://web.ksei.co.id/test")):
                snapshot = MODULE.sync_month(2026, 11, cache, 2)
                self.assertEqual(snapshot["period"], "2026-11")
                self.assertEqual(snapshot["upstreamCount"], 0)
                self.assertEqual(snapshot["documents"], {})
                self.assertTrue((cache / "2026-11.json").exists())

    def test_sync_month_table_state_extracts_items(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = Path(tmpdir)
            with patch.object(MODULE, "get", return_value=(SAMPLE_TABLE_PAGE, "https://web.ksei.co.id/test")), \
                 patch.object(MODULE, "fetch_document", return_value=({"id": "KSEI:12345"}, None)):
                snapshot = MODULE.sync_month(2026, 10, cache, 2)
                self.assertEqual(snapshot["period"], "2026-10")
                self.assertEqual(snapshot["upstreamCount"], 1)
                self.assertIn("12345", snapshot["documents"])

    def test_sync_month_corrupted_page_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache = Path(tmpdir)
            with patch.object(MODULE, "get", return_value=(SAMPLE_CORRUPTED_PAGE, "https://web.ksei.co.id/test")):
                with self.assertRaises(RuntimeError) as ctx:
                    MODULE.sync_month(2026, 11, cache, 2)
                self.assertIn("struktur daftar KSEI tidak dikenali", str(ctx.exception))

    def test_parse_document_valid(self):
        text = "Panggilan Rapat Umum Pemegang Saham Luar Biasa (RUPSLB) PT Bank Central Asia Tbk (BBCA) pada tanggal 15/11/2026 pukul 10:00 WIB"
        doc = MODULE.parse_document(text, "DOC01", "https://ksei/doc", "01/11/2026", "sha256hash")
        self.assertEqual(doc["symbol"], "BBCA")
        self.assertEqual(doc["type"], "RUPSLB")
        self.assertEqual(doc["date"], "2026-11-15")
        self.assertEqual(doc["timeWib"], "10:00")

    def test_parse_document_missing_ticker_fails_closed(self):
        text = "Panggilan Rapat Umum Pemegang Saham pada tanggal 15/11/2026 tanpa ticker emiten"
        with self.assertRaises(ValueError):
            MODULE.parse_document(text, "DOC02", "https://ksei/doc", "01/11/2026", "sha256hash")


if __name__ == "__main__":
    unittest.main()
