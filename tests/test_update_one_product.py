"""Tek ürün fiyat kontrolü (check/apply) ve fiyat geçmişi testleri.

Market kaynağı taklit edilir (simülasyon); gerçek markete istek atılmaz.
"""
import importlib.util
import io
import json
import os
import pathlib
import shutil
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import pricehist  # noqa: E402

spec = importlib.util.spec_from_file_location("uop", ROOT / "scripts" / "update_one_product.py")
uop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uop)


def body(market, pid, name):
    return ("Talep\n<!-- market-fiyat-price-update\n"
            + json.dumps({"market": market, "id": pid, "name": name}, ensure_ascii=False) + "\n-->")


class RequestParsingTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(uop.parse_request(body("sok", "sok:10", " Cola  1 L ")), ("sok", "sok:10", "Cola 1 L"))

    def test_rejections(self):
        cases = {
            "işaret yok": "merhaba",
            "bozuk json": "<!-- market-fiyat-price-update {bozuk} -->",
            "market yok": body("a101", "a101:1", "x"),
            "market uyuşmazlığı": body("sok", "migros:1", "x"),
            "sahte kimlik": body("sok", "sok:1;rm -rf /", "x"),
            "boş ad": body("sok", "sok:1", "  "),
            "çok uzun ad": body("sok", "sok:1", "x" * 300),
        }
        for label, text in cases.items():
            with self.subTest(label):
                self.assertIsInstance(uop.parse_request(text), str)


class CheckApplyTests(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        for d in ("collector", "scripts"):
            shutil.copytree(ROOT / d, self.root / d, ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy(ROOT / "config.json", self.root / "config.json")
        (self.root / "data").mkdir()
        self.c = self.load_collector()
        rows = {
            "sok:10": {"id": "sok:10", "market": "sok", "name": "Crown Cola Pet 250 ml", "price": 14.0, "regular": 14.0,
                       "in_stock": True, "image": "", "url": "https://www.sokmarket.com.tr/crown-cola-pet-250-ml-p-10",
                       "cat": "İçecek", "promo": "", "seen": 1700000000},
            "sok:11": {"id": "sok:11", "market": "sok", "name": "Ayran 1 L", "price": 30.0, "regular": 40.0,
                       "in_stock": True, "image": "", "url": "https://www.sokmarket.com.tr/ayran-1-l-p-11",
                       "cat": "Süt", "promo": "", "seen": 1700000000},
        }
        self.c.write("sok", rows, "2026-11-20T00:00:00+00:00")
        self.fresh = None
        self.calls = 0
        p = patch.object(uop, "ROOT", self.root)
        p.start()
        self.addCleanup(p.stop)
        p = patch.object(uop, "collector", lambda: self.c)
        p.start()
        self.addCleanup(p.stop)

        def fake_one(product):
            self.calls += 1
            if isinstance(self.fresh, Exception):
                raise self.fresh
            return dict(self.fresh, source=product["url"])
        self.c.ONE = {"sok": fake_one, "migros": fake_one, "bim": fake_one}

    def load_collector(self):
        s = importlib.util.spec_from_file_location("test_collector_copy", self.root / "collector" / "collect.py")
        m = importlib.util.module_from_spec(s)
        s.loader.exec_module(m)
        return m

    def run_flow(self, pid="sok:10", name="Crown Cola Pet 250 ml", market="sok"):
        res, com = self.root / "r.json", self.root / "c.md"
        env = {"ISSUE_BODY": body(market, pid, name), "ISSUE_NUMBER": "7"}
        with patch.dict(os.environ, env), redirect_stdout(io.StringIO()):
            uop.check(res)
            uop.apply(res, com)
        data = self.c.parse_file(self.root / "data" / "sok.json")
        checks = json.loads((self.root / "data" / "price-checks.json").read_text(encoding="utf-8")) \
            if (self.root / "data" / "price-checks.json").exists() else {"checks": {}}
        return com.read_text(encoding="utf-8"), data, checks["checks"]

    def test_price_unchanged(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 14.0, "regular": 14.0, "in_stock": True}
        text, data, checks = self.run_flow()
        self.assertIn("Fiyat değişmedi", text)
        self.assertEqual(checks["sok:10"]["status"], "unchanged")
        self.assertGreater(data["sok:10"]["seen"], 1700000000)  # son kontrol zamanı güncellendi
        self.assertFalse((self.root / "data" / "history-sok.json").exists()
                         and json.loads((self.root / "data" / "history-sok.json").read_text())["items"])

    def test_price_increase_records_history(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 15.5, "regular": 15.5, "in_stock": True}
        text, data, checks = self.run_flow()
        self.assertIn("Fiyat arttı", text)
        self.assertIn("+%10,7", text)
        self.assertEqual(data["sok:10"]["price"], 15.5)
        self.assertEqual(data["sok:11"]["price"], 30.0)  # başka ürüne dokunulmadı
        hist = json.loads((self.root / "data" / "history-sok.json").read_text())["items"]["sok:10"]
        self.assertEqual([p[1] for p in hist], [14.0, 15.5])

    def test_price_decrease_and_discount_start(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 11.0, "regular": 14.0, "in_stock": True}
        text, data, checks = self.run_flow()
        self.assertIn("Fiyat düştü", text)
        self.assertIn("%21 indirim", text)
        self.assertEqual((data["sok:10"]["price"], data["sok:10"]["regular"]), (11.0, 14.0))
        self.assertEqual(checks["sok:10"]["change"], -3.0)

    def test_discount_end(self):
        self.fresh = {"name": "Ayran 1 L", "price": 40.0, "regular": 40.0, "in_stock": True}
        text, data, checks = self.run_flow("sok:11", "Ayran 1 L")
        self.assertEqual((data["sok:11"]["price"], data["sok:11"]["regular"]), (40.0, 40.0))
        self.assertIn("Fiyat arttı", text)

    def test_out_of_stock_only(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 14.0, "regular": 14.0, "in_stock": False}
        text, data, checks = self.run_flow()
        self.assertIn("Stok durumu güncellendi", text)
        self.assertFalse(data["sok:10"]["in_stock"])

    def test_not_found_keeps_old_price(self):
        self.fresh = self.c.NotFound("sok:10")
        text, data, checks = self.run_flow()
        self.assertIn("Ürün doğrulanamadı", text)
        self.assertEqual(data["sok:10"]["price"], 14.0)
        self.assertEqual(data["sok:10"]["seen"], 1700000000)
        self.assertEqual(checks["sok:10"]["status"], "failed")

    def test_source_error_keeps_old_price(self):
        self.fresh = self.c.Stop("www.sokmarket.com.tr: durum 403")
        text, data, checks = self.run_flow()
        self.assertIn("durum 403", text)
        self.assertEqual(data["sok:10"]["price"], 14.0)

    def test_name_mismatch_from_source(self):
        self.fresh = {"name": "Tamamen Başka Ürün 5 Kg", "price": 99.0, "regular": 99.0, "in_stock": True}
        text, data, checks = self.run_flow()
        self.assertIn("kaynaktaki ad farklı", text)
        self.assertEqual(data["sok:10"]["price"], 14.0)

    def test_invalid_source_price(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 0, "regular": 0, "in_stock": True}
        text, data, checks = self.run_flow()
        self.assertIn("fiyat geçersiz", text)
        self.assertEqual(data["sok:10"]["price"], 14.0)

    def test_manipulated_request_name_is_rejected_without_network(self):
        self.fresh = {"name": "x", "price": 1, "regular": 1, "in_stock": True}
        text, data, checks = self.run_flow(name="Sahte Ad")
        self.assertIn("kontrolü yapılmadı", text)
        self.assertEqual(self.calls, 0)
        self.assertNotIn("sok:10", checks)

    def test_unknown_product_without_network(self):
        text, data, checks = self.run_flow(pid="sok:999", name="Yok")
        self.assertIn("kataloğunda yok", text)
        self.assertEqual(self.calls, 0)

    def test_market_mismatch(self):
        text, _, _ = self.run_flow(pid="sok:10", market="migros")
        self.assertIn("uyuşmuyor", text)
        self.assertEqual(self.calls, 0)

    def test_repeat_request_within_10_minutes_skips_market(self):
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 14.0, "regular": 14.0, "in_stock": True}
        self.run_flow()
        text, _, _ = self.run_flow()
        self.assertIn("yakın zamanda kontrol edildi", text)
        self.assertEqual(self.calls, 1)

    def test_apply_on_newer_main_uses_current_record(self):
        """Kontrolden sonra ana dal değiştiyse karşılaştırma güncel kayda göre yapılır."""
        self.fresh = {"name": "Crown Cola Pet 250 ml", "price": 16.0, "regular": 16.0, "in_stock": True}
        res, com = self.root / "r.json", self.root / "c.md"
        with patch.dict(os.environ, {"ISSUE_BODY": body("sok", "sok:10", "Crown Cola Pet 250 ml")}), \
                redirect_stdout(io.StringIO()):
            uop.check(res)
            catalog = self.c.read_old("sok")
            catalog["sok:10"]["price"] = catalog["sok:10"]["regular"] = 16.0  # başka iş bu arada yayımladı
            self.c.write("sok", catalog, "2026-11-21T00:00:00+00:00")
            uop.apply(res, com)
        self.assertIn("Fiyat değişmedi", com.read_text(encoding="utf-8"))


class HistoryTests(unittest.TestCase):
    def test_same_price_is_not_repeated(self):
        h = {"v": 1, "market": "sok", "items": {}}
        self.assertTrue(pricehist.add_change(h, "sok:1", (10, 10, 100), (12, 12, 200), 200, "deals"))
        self.assertFalse(pricehist.add_change(h, "sok:1", (12, 12, 200), (12, 12, 300), 300, "deals"))
        self.assertTrue(pricehist.add_change(h, "sok:1", (12, 12, 300), (9, 12, 400), 400, "deals"))
        self.assertEqual([p[1] for p in h["items"]["sok:1"]], [10, 12, 9])

    def test_campaign_change_is_recorded(self):
        h = {"v": 2, "market": "migros", "items": {}}
        self.assertTrue(pricehist.add_change(h, "m:1", (10, 10, 100, ""), (10, 10, 200, "2 Al 1 Öde"), 200, "full"))
        self.assertFalse(pricehist.add_change(h, "m:1", None, (10, 10, 300, "2 Al 1 Öde"), 300, "full"))
        self.assertTrue(pricehist.add_change(h, "m:1", None, (10, 10, 400, ""), 400, "full"))
        self.assertEqual([p[4] for p in h["items"]["m:1"]], ["", "2 Al 1 Öde", ""])

    def test_v1_file_is_upgraded(self):
        d = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d)
        (d / "h.json").write_text(json.dumps({"v": 1, "market": "sok", "items": {"sok:1": [[100, 5, 5, "önceki"], [200, 4, 5, "full"]]}}))
        h = pricehist.load(d / "h.json", "sok")
        self.assertEqual((h["v"], h["since"]), (2, 100))
        self.assertFalse(pricehist.add_change(h, "sok:1", None, (4, 5, 300, ""), 300, "full"))  # 4 alanlı nokta kampanyasız sayılır

    def test_unchanged_first_observation_is_not_stored(self):
        h = {"v": 1, "market": "sok", "items": {}}
        self.assertFalse(pricehist.add_change(h, "sok:1", (10, 10, 1), (10, 10, 2), 2, "full"))
        self.assertEqual(h["items"], {})

    def test_prune_limits_size_and_age(self):
        now = int(time.time())
        h = {"v": 1, "market": "sok", "items": {
            "a": [[now - i * 3600, 10 + i, 10 + i, ""] for i in range(60)],
            "old": [[now - 400 * 86400, 1, 1, ""], [now - 300 * 86400, 2, 2, ""]],
            "bad": [["x", 1, 1], [now, -1, 1, ""]],
        }}
        pricehist.prune(h, now)
        self.assertEqual(len(h["items"]["a"]), pricehist.MAX_POINTS)
        self.assertNotIn("old", h["items"])
        self.assertNotIn("bad", h["items"])

    def test_record_publish_diffs_versions(self):
        d = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d)
        fields = ["id", "name", "price", "regular", "in_stock", "image", "url", "cat", "promo", "seen"]
        t1, t2 = int(time.time()) - 7200, int(time.time()) - 60
        old = {"updated": "2026-11-20T00:00:00+00:00", "fields": fields,
               "products": [["sok:1", "A", 10, 10, 1, "", "", 0, "", t1], ["sok:2", "B", 5, 5, 1, "", "", 0, "", t1]]}
        new = {"updated": "2026-11-21T00:00:00+00:00", "fields": fields,
               "products": [["sok:1", "A", 8, 10, 1, "", "", 0, "", t2], ["sok:2", "B", 5, 5, 1, "", "", 0, "", t2],
                            ["sok:3", "C", 1, 1, 1, "", "", 0, "", t2]]}
        n = pricehist.record_publish(d / "h.json", "sok", old, new, "deals")
        self.assertEqual(n, 1)
        items = json.loads((d / "h.json").read_text())["items"]
        self.assertEqual(list(items), ["sok:1"])
        self.assertEqual([p[1:3] for p in items["sok:1"]], [[10, 10], [8, 10]])
        self.assertTrue(json.loads((d / "h.json").read_text())["since"])


if __name__ == "__main__":
    unittest.main()
