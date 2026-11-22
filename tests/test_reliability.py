"""Veri doğrulama, atomik yazım, tek ürün sorguları ve tarama birleştirme testleri.

Ağ istekleri taklit edilir (simülasyon); Şok/BİM ürün sayfası örnekleri gerçek
sayfalardan kırpılmıştır (tests/fixtures).
"""
import json
import pathlib
import shutil
import tempfile
import unittest
from unittest.mock import patch

from collector import collect

FIX = pathlib.Path(__file__).parent / "fixtures"


def prod(pid, name="Ürün 1 L", price=10.0, regular=None, **kw):
    market = pid.split(":")[0]
    base = {"migros": "https://www.migros.com.tr/x-p-1", "sok": "https://www.sokmarket.com.tr/x-p-1",
            "bim": "https://www.bim.com.tr/aktuel-urunler/x/aktuel.aspx"}[market]
    p = {"id": pid, "market": market, "name": name, "price": price,
         "regular": price if regular is None else regular, "in_stock": True,
         "image": "", "url": base, "cat": "İçecek", "promo": ""}
    p.update(kw)
    return p


class ValidationTests(unittest.TestCase):
    def check(self, p, market="sok"):
        return collect.validate_products(market, {p["id"]: p})

    def test_valid_record_passes(self):
        clean, issues = self.check(prod("sok:1", price=12.5, regular=15))
        self.assertEqual(clean["sok:1"]["price"], 12.5)
        self.assertFalse(any(issues.values()))

    def test_missing_id_is_rejected(self):
        clean, issues = collect.validate_products("sok", {"": prod("sok:1", id="")})
        self.assertEqual(clean, {})
        self.assertEqual(issues["missing_id"], 1)

    def test_wrong_market_id_is_rejected(self):
        clean, issues = self.check(prod("migros:123"), market="sok")
        self.assertEqual(clean, {})
        self.assertEqual(issues["bad_id"], 1)

    def test_missing_name_is_rejected(self):
        clean, issues = self.check(prod("sok:1", name="  "))
        self.assertEqual(issues["missing_name"], 1)
        self.assertEqual(clean, {})

    def test_negative_zero_and_garbage_prices_are_rejected(self):
        for bad in (-1, 0, "abc", float("nan"), float("inf"), None):
            with self.subTest(price=bad):
                clean, issues = self.check(prod("sok:1", price=bad, regular=5))
                self.assertEqual(clean, {})
                self.assertEqual(issues["bad_price"], 1)

    def test_regular_below_price_produces_no_discount(self):
        clean, issues = self.check(prod("sok:1", price=20, regular=15))
        self.assertEqual(clean["sok:1"]["regular"], 20)
        self.assertEqual(issues["regular_below_price"], 1)

    def test_absurd_discount_is_neutralised(self):
        clean, issues = self.check(prod("sok:1", price=1, regular=50))
        self.assertEqual(clean["sok:1"]["regular"], 1)
        self.assertEqual(issues["suspicious_discount"], 1)

    def test_foreign_url_is_dropped(self):
        clean, issues = self.check(prod("sok:1", url="https://evil.example/x"))
        self.assertEqual(clean["sok:1"]["url"], "")
        self.assertEqual(issues["bad_url"], 1)


class WriteTests(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_roundtrip_keeps_seen_and_promo(self):
        path = self.dir / "sok.json"
        products = {"sok:1": prod("sok:1", price=3.5, regular=4, promo="2 Al 1 Öde", seen=1700000000),
                    "sok:2": prod("sok:2", name="Başka 500 g", price=7)}
        collect.write("sok", products, "2026-11-21T00:00:00+00:00", path)
        back = collect.parse_file(path)
        self.assertEqual(back["sok:1"]["seen"], 1700000000)
        self.assertIsNone(back["sok:2"]["seen"])
        self.assertEqual(back["sok:1"]["promo"], "2 Al 1 Öde")
        self.assertEqual(back["sok:1"]["regular"], 4)

    def test_old_files_without_seen_column_are_readable(self):
        path = self.dir / "sok.json"
        path.write_text(json.dumps({"updated": "x", "fields": collect.FIELDS[:-1], "prefix": {}, "cats": {"sok": ["A"]},
                                    "products": [["sok:9", "Eski", 1.5, 2, 1, "", "", 0, ""]]}), encoding="utf-8")
        back = collect.parse_file(path)
        self.assertEqual(back["sok:9"]["price"], 1.5)
        self.assertIsNone(back["sok:9"]["seen"])

    def test_empty_catalog_is_never_written(self):
        path = self.dir / "sok.json"
        path.write_text("ESKİ", encoding="utf-8")
        with self.assertRaises(ValueError):
            collect.write("sok", {}, "x", path)
        self.assertEqual(path.read_text(encoding="utf-8"), "ESKİ")

    def test_invalid_json_is_never_written(self):
        path = self.dir / "a.json"
        path.write_text("{}", encoding="utf-8")
        with self.assertRaises(ValueError):
            collect.atomic_write(path, "{bozuk")
        self.assertEqual(path.read_text(encoding="utf-8"), "{}")
        self.assertEqual(list(self.dir.glob(".*.tmp")), [])


class MigrosTests(unittest.TestCase):
    def test_money_only_discount_is_marked(self):
        item = collect.migros_item({"sku": "01010085", "name": "Pirinç 1 Kg", "shownPrice": 12995,
                                    "regularPrice": 19995, "status": "IN_SALE", "loyaltyPromotionId": 1})
        self.assertIn(collect.MONEY, item["promo"])
        self.assertEqual((item["price"], item["regular"]), (129.95, 199.95))

    def test_regular_discount_is_not_marked_as_money(self):
        item = collect.migros_item({"sku": "1", "shownPrice": 100, "regularPrice": 200})
        self.assertNotIn(collect.MONEY, item["promo"])

    def test_single_product_endpoint(self):
        dto = {"sku": "01010085", "name": "Yayla Basmati Pirinç 1 Kg", "shownPrice": 12995,
               "regularPrice": 19995, "status": "IN_SALE", "saleable": True, "loyaltyPromotionId": 5,
               "prettyName": "yayla-basmati-pirinc-1-kg-p-f69a5"}
        seen = []

        def fake_get(url, accept="application/json"):
            seen.append(url)
            return 200, json.dumps({"successful": True, "data": {"storeProductInfoDTO": dto}})
        with patch.object(collect, "get", fake_get):
            out = collect.migros_one(prod("migros:01010085"))
        self.assertEqual(seen, ["https://www.migros.com.tr/rest/products/screens/20000001010085"])
        self.assertEqual((out["price"], out["regular"], out["in_stock"]), (129.95, 199.95, True))

    def test_single_product_sku_mismatch_is_not_found(self):
        body = json.dumps({"successful": True, "data": {"storeProductInfoDTO": {"sku": "999"}}})
        with patch.object(collect, "get", lambda u, a="": (200, body)):
            with self.assertRaises(collect.NotFound):
                collect.migros_one(prod("migros:01010085"))

    def test_single_product_404(self):
        with patch.object(collect, "get", lambda u, a="": (404, "")):
            with self.assertRaises(collect.NotFound):
                collect.migros_one(prod("migros:01010085"))

    def test_vanished_sitemap_category_is_skipped(self):
        cfg = dict(collect.CFG["migros"], seed_ids=[], max_discovery=10)
        sitemap = "<loc>https://www.migros.com.tr/powerbank-c-12090</loc><loc>https://www.migros.com.tr/su-c-84</loc>"
        page = {"data": {"searchInfo": {"pageCount": 1, "hitCount": 1, "storeProductInfos": [
            {"id": 1, "sku": "1", "name": "Su 1 L", "shownPrice": 500, "regularPrice": 500, "status": "IN_SALE",
             "category": {"name": "Su", "prettyName": "su-c-84"}}]}}}

        def fake_get(url, accept="application/json"):
            if "sitemap" in url:
                return 200, sitemap
            if "powerbank" in url:
                return 404, ""
            return 200, json.dumps(page)
        products, notes = {}, []
        with patch.dict(collect.CFG, {"migros": cfg}), patch.object(collect, "get", fake_get):
            collect.migros(products, notes)
        self.assertIn("migros:1", products)
        self.assertTrue(any("powerbank-c-12090" in n for n in notes))


class SokBimSingleTests(unittest.TestCase):
    def test_sok_product_page(self):
        body = (FIX / "sok_product.html").read_text(encoding="utf-8")
        with patch.object(collect, "get", lambda u, a="": (200, body)):
            out = collect.sok_one(prod("sok:102793", url="https://www.sokmarket.com.tr/fanta-mandalina-2-5-l-p-102793"))
        self.assertEqual((out["name"], out["price"], out["regular"], out["in_stock"]),
                         ("Fanta Mandalina 2.5 L", 79.9, 90.0, True))

    def test_sok_rejects_unexpected_url(self):
        with self.assertRaises(collect.Stop):
            collect.sok_one(prod("sok:102793", url="https://evil.example/x-p-102793"))

    def test_sok_other_product_on_page_is_not_found(self):
        body = (FIX / "sok_product.html").read_text(encoding="utf-8")
        with patch.object(collect, "get", lambda u, a="": (200, body)):
            with self.assertRaises(collect.NotFound):
                collect.sok_one(prod("sok:555", url="https://www.sokmarket.com.tr/fanta-mandalina-2-5-l-p-555"))

    def test_bim_product_page(self):
        body = (FIX / "bim_product.html").read_text(encoding="utf-8")
        p = prod("bim:-0-5-yagli-sut-16-11", url="https://www.bim.com.tr/aktuel-urunler/-0-5-yagli-sut-16-11/aktuel.aspx")
        with patch.object(collect, "get", lambda u, a="": (200, body)):
            out = collect.bim_one(p)
        self.assertEqual((out["name"], out["price"]), ("%0,5 YAĞLI SÜT", 42.5))

    def test_source_access_error_stops(self):
        p = prod("bim:x", url="https://www.bim.com.tr/aktuel-urunler/x/aktuel.aspx")
        with patch.object(collect, "get", lambda u, a="": (500, "")):
            with self.assertRaises(collect.Stop):
                collect.bim_one(p)


class MainMergeTests(unittest.TestCase):
    """collect.main() uçtan uca: geçici veri klasöründe, taklit tarama fonksiyonlarıyla."""

    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        (self.root / "data").mkdir()
        old = {"sok:1": prod("sok:1", price=10), "sok:2": prod("sok:2", name="İki 1 L", price=20, regular=25),
               "sok:3": prod("sok:3", name="Üç 1 L", price=30)}
        collect.write("sok", old, "2026-11-20T00:00:00+00:00", self.root / "data" / "sok.json")
        patcher = patch.object(collect, "ROOT", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)
        for name in ("ERRORS", "STATS"):
            p = patch.object(collect, name, [] if name == "ERRORS" else {})
            p.start()
            self.addCleanup(p.stop)
        p = patch.object(collect, "SOK_PROMOS", None)
        p.start()
        self.addCleanup(p.stop)

    def run_main(self, mode, job):
        with patch.dict(collect.JOBS, {("sok", mode): job}), patch("sys.argv", ["x", "sok", mode]):
            try:
                collect.main()
                code = 0
            except SystemExit as e:
                code = e.code
        status = json.loads((self.root / "data" / "status-sok.json").read_text(encoding="utf-8"))
        return code, collect.parse_file(self.root / "data" / "sok.json"), status

    def test_deals_updates_only_fresh_items(self):
        def job(products, notes):
            products["sok:1"] = prod("sok:1", price=8, regular=10)
        code, data, status = self.run_main("deals", job)
        self.assertEqual(code, 0)
        self.assertEqual((data["sok:1"]["price"], data["sok:1"]["regular"]), (8, 10))
        self.assertEqual(data["sok:2"]["price"], 20)
        self.assertGreater(data["sok:1"]["seen"], data["sok:2"]["seen"])
        self.assertEqual(status["collected_products"], 1)
        self.assertEqual(status["total_products"], 3)

    def test_failed_crawl_without_products_keeps_old_data(self):
        before = (self.root / "data" / "sok.json").read_text(encoding="utf-8")

        def job(products, notes):
            raise collect.Stop("www.sokmarket.com.tr: durum 403")
        code, data, status = self.run_main("full", job)
        self.assertEqual(code, 1)
        self.assertEqual((self.root / "data" / "sok.json").read_text(encoding="utf-8"), before)
        self.assertFalse(status["complete"])
        self.assertFalse(status["partial"])
        self.assertEqual(status["data_updated"], "2026-11-20T00:00:00+00:00")

    def test_interrupted_full_crawl_publishes_what_it_read(self):
        """403 ile yarıda kalan tam tarama: okunan fiyatlar yayımlanır, kalanlar silinmez."""
        def job(products, notes):
            products["sok:1"] = prod("sok:1", price=9)
            raise collect.Stop("www.sokmarket.com.tr: durum 403")
        code, data, status = self.run_main("full", job)
        self.assertEqual(code, 1)
        self.assertEqual(len(data), 3)
        self.assertEqual(data["sok:1"]["price"], 9)
        self.assertEqual(data["sok:2"]["price"], 20)
        self.assertTrue(status["partial"])
        self.assertFalse(status["complete"])
        self.assertNotEqual(status["data_updated"], "2026-11-20T00:00:00+00:00")

    def test_suspiciously_small_full_crawl_does_not_delete_catalog(self):
        def job(products, notes):
            products["sok:1"] = prod("sok:1", price=11)  # 3 üründen 1'i: eşik altında
        code, data, status = self.run_main("full", job)
        self.assertEqual(code, 1)
        self.assertEqual(len(data), 3)  # hiçbir ürün silinmedi
        self.assertEqual(data["sok:1"]["price"], 11)  # okunan fiyat yine de güncel
        self.assertTrue(status["partial"])

    def test_long_unseen_products_are_dropped(self):
        cat = collect.read_old("sok")
        cat["sok:3"]["seen"] = 1000  # yıllardır görülmemiş
        collect.write("sok", cat, "2026-11-20T00:00:00+00:00", self.root / "data" / "sok.json")

        def job(products, notes):
            products["sok:1"] = prod("sok:1", price=9)
            raise collect.Stop("durum 403")
        code, data, status = self.run_main("full", job)
        self.assertNotIn("sok:3", data)
        self.assertIn("sok:2", data)

    def test_invalid_fresh_row_is_not_published(self):
        def job(products, notes):
            products["sok:1"] = prod("sok:1", price=-5)
            products["sok:2"] = prod("sok:2", name="İki 1 L", price=19, regular=25)
        code, data, status = self.run_main("deals", job)
        self.assertEqual(data["sok:1"]["price"], 10)
        self.assertEqual(data["sok:2"]["price"], 19)
        self.assertEqual(status["invalid_products"], 1)

    def test_discount_ended_in_full_crawl(self):
        def job(products, notes):
            for pid, price in (("sok:1", 10), ("sok:2", 25), ("sok:3", 30)):
                products[pid] = prod(pid, price=price)
        code, data, status = self.run_main("full", job)
        self.assertEqual(code, 0)
        self.assertEqual((data["sok:2"]["price"], data["sok:2"]["regular"]), (25, 25))
        self.assertEqual(status["discounted_products"], 0)


if __name__ == "__main__":
    unittest.main()


class BimDiscountTests(unittest.TestCase):
    """BİM indirimli üründe üstü çizili eski fiyat ile satış fiyatı karışmamalı (gerçek sayfa kesiti)."""

    def test_list_card_uses_sale_price(self):
        body = (FIX / "bim_list_discount.html").read_text(encoding="utf-8")
        cards = collect.bim_cards(body, "21-27 Kasım")
        x = cards["bim:hazir-kahve-3u1-arada--2si1-arada-17-5-g--10-g-21-11"]
        self.assertEqual((x["price"], x["regular"]), (12.0, 15.0))
        self.assertTrue(x["image"].startswith("https://"))

    def test_product_page_uses_sale_price(self):
        body = (FIX / "bim_product_discount.html").read_text(encoding="utf-8")
        p = prod("bim:hazir-kahve-3u1-arada--2si1-arada-17-5-g--10-g-21-11",
                 url="https://www.bim.com.tr/aktuel-urunler/hazir-kahve-3u1-arada--2si1-arada-17-5-g--10-g-21-11/aktuel.aspx")
        with patch.object(collect, "get", lambda u, a="": (200, body)):
            out = collect.bim_one(p)
        self.assertEqual((out["price"], out["regular"]), (12.0, 15.0))

    def test_price_parts(self):
        blk = ('<div class="priceArea"><div class="CountButton strikethrough"><div class="text quantify">1.325,</div>'
               '<div class="kusurArea"><span class="number">50</span></div></div><a class="gButton triangle" href="#">'
               '<div class="text quantify">1.099,</div><div class="kusurArea"><span class="number">9</span></div></a></div>')
        self.assertEqual(collect.bim_price(blk), (1099.9, 1325.5))


class DataMergeTests(unittest.TestCase):
    """Yayımlama sırasında ürün bazında birleştirme (scripts/datamerge.py)."""

    def setUp(self):
        import sys
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
        import datamerge
        self.m = datamerge

    def rows(self, **kw):
        return {k: prod(k.replace("_", ":"), price=v[0], seen=v[1]) for k, v in kw.items()}

    def test_newer_verification_wins(self):
        cur = {"sok:1": prod("sok:1", price=10, seen=500), "sok:2": prod("sok:2", price=20, seen=100)}
        inc = {"sok:1": prod("sok:1", price=12, seen=300), "sok:2": prod("sok:2", price=22, seen=300)}
        out, st = self.m.merge_rows(cur, inc, True, 200)
        self.assertEqual(out["sok:1"]["price"], 10)   # saatlik tarama daha yeni doğruladı
        self.assertEqual(out["sok:2"]["price"], 22)
        self.assertEqual(st["kept_newer"], 1)

    def test_complete_catalog_drops_delisted_but_keeps_recent(self):
        cur = {"sok:1": prod("sok:1", seen=100), "sok:2": prod("sok:2", seen=100), "sok:3": prod("sok:3", seen=900)}
        inc = {"sok:1": prod("sok:1", seen=800)}
        out, st = self.m.merge_rows(cur, inc, True, 500)
        self.assertEqual(sorted(out), ["sok:1", "sok:3"])  # sok:2 kaldırıldı, sok:3 tarama sırasında doğrulandı
        self.assertEqual(st["dropped"], 1)

    def test_deals_or_partial_keep_everything(self):
        cur = {"sok:1": prod("sok:1", seen=100), "sok:2": prod("sok:2", seen=100)}
        inc = {"sok:1": prod("sok:1", price=5, seen=800)}
        out, _ = self.m.merge_rows(cur, inc, False, 500)
        self.assertEqual(sorted(out), ["sok:1", "sok:2"])
        self.assertEqual(out["sok:1"]["price"], 5)


class HealthTests(unittest.TestCase):
    def test_reports_stale_and_unverified_data(self):
        import datetime
        import importlib.util
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root)
        (root / "data").mkdir()
        spec = importlib.util.spec_from_file_location("health", pathlib.Path(__file__).resolve().parent.parent / "scripts" / "health.py")
        h = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(h)
        now = datetime.datetime(2026, 11, 22, 12, tzinfo=datetime.timezone.utc)
        fresh_ts, old_ts = int(now.timestamp()) - 3600, int(now.timestamp()) - 5 * 86400
        for m, updated, seen in (("migros", "2026-11-21T00:00:00+00:00", old_ts), ("sok", "2026-11-22T11:00:00+00:00", fresh_ts),
                                 ("bim", "2026-11-22T08:00:00+00:00", fresh_ts)):
            collect.write(m, {f"{m}:1": prod(f"{m}:1" if m != "bim" else "bim:x", seen=seen)} if m != "bim" else
                          {"bim:x": prod("bim:x", seen=seen)}, updated, root / "data" / f"{m}.json")
            (root / "data" / f"status-{m}.json").write_text(json.dumps({"status": "tamam"}), encoding="utf-8")
        with patch.object(h, "ROOT", root):
            r = h.check(now)
        self.assertFalse(r["ok"])
        self.assertEqual(len([p for p in r["problems"] if p.startswith("Migros")]), 2)  # 36 saatlik veri + %0 doğrulama
        self.assertFalse(any(p.startswith(("Şok", "BİM")) for p in r["problems"]))
