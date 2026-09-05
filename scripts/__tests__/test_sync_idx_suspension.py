"""Regresi parser PDF multi-emiten untuk sync-idx-suspension.py.

Tidak menyentuh jaringan. PDF nyata diuji terpisah saat sync; test ini menjaga kontrak
fail-closed dan mencegah kata 4 huruf seperti POJK/VIII dipromosikan jadi emiten.
"""
from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).parents[1] / "sync-idx-suspension.py"
SPEC = importlib.util.spec_from_file_location("sync_idx_suspension", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, status_code=200, content=b"%PDF fake"):
        self.status_code = status_code
        self.content = content


class FakeSession:
    def __init__(self, response):
        self.response = response

    def get(self, *_args, **_kwargs):
        return self.response


class PdfTickerExtractionTest(unittest.TestCase):
    def test_intersection_with_universe_rejects_four_letter_words(self):
        with tempfile.TemporaryDirectory() as temp:
            text_path = pathlib.Path(temp) / "fixture.txt"
            text_path.write_text("Emiten MENN NINE SOUL. Dasar POJK bab VIII.")

            def fake_run(command, **_kwargs):
                pathlib.Path(command[-1]).write_text(text_path.read_text())
                return type("Result", (), {"returncode": 0})()

            universe = {"MENN", "NINE", "SOUL"}
            with patch.object(MODULE.shutil, "which", return_value="/usr/bin/pdftotext"), \
                 patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                tickers, error = MODULE.extract_tickers_from_pdf(
                    FakeSession(FakeResponse()), "/StaticData/example.pdf", universe, 1, 1,
                )

        self.assertIsNone(error)
        self.assertEqual(tickers, ["MENN", "NINE", "SOUL"])
        self.assertNotIn("POJK", tickers)
        self.assertNotIn("VIII", tickers)

    def test_http_failure_remains_unresolved(self):
        row = {
            "eventId": "x",
            "date": "2026-09-01",
            "occurredAt": "2026-09-01T10:00:00",
            "infoType": "SPT",
            "title": "multi",
            "attachment": "/StaticData/example.pdf",
            "rawCode": ">1 Kode",
            "reason": "kode bukan emiten tunggal",
        }
        events, unresolved, pdf_rows, codes = MODULE.resolve_multi_ticker_rows(
            FakeSession(FakeResponse(503, b"")), [], [row], {"BBCA"}, 1, 1,
        )
        self.assertEqual(events, [])
        self.assertEqual(pdf_rows, 0)
        self.assertEqual(codes, 0)
        self.assertEqual(len(unresolved), 1)
        self.assertIn("gagal mengunduh PDF", unresolved[0]["reason"])

    def test_same_day_spt_then_upt_uses_clock_after_pdf_expansion(self):
        events = [
            {"eventId": "morning", "ticker": "AAAA", "occurredAt": "2026-09-03T09:00:00",
             "date": "2026-09-03", "infoType": "SPT", "suspended": True},
            {"eventId": "afternoon", "ticker": "AAAA", "occurredAt": "2026-09-03T15:00:00",
             "date": "2026-09-03", "infoType": "UPT", "suspended": False},
        ]
        status = MODULE.build_statuses(events, [])["AAAA"]
        self.assertEqual(status["status"], "ACTIVE")
        self.assertEqual(status["occurredAt"], "2026-09-03T15:00:00")


if __name__ == "__main__":
    unittest.main()
