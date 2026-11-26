import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("notify", ROOT / "scripts" / "notify.py")
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)


class NotifyTests(unittest.TestCase):
    def test_parse_watch_lines_and_targets(self):
        body = "<!-- açıklama -->\nmigros:123 | Pınar Süt 1 L | hedef=39,90\n- sok:10 | Crown Cola\nrastgele satır\nbim:yag-16-11"
        w = notify.parse_watch(body)
        self.assertEqual(set(w), {"migros:123", "sok:10", "bim:yag-16-11"})
        self.assertEqual(w["migros:123"]["target"], 39.9)
        self.assertIsNone(w["sok:10"]["target"])

    def test_parse_barcodes(self):
        b = notify.parse_barcodes("migros:1 | Süt\nbarkod 8690504017301 = sok:10\nbarkod 12 = sok:1")
        self.assertEqual(b, {"8690504017301": "sok:10"})
        self.assertNotIn("barkod", "".join(notify.parse_watch("barkod 8690504017301 = sok:10")))

    def test_expand_adds_other_markets_of_group(self):
        w = notify.expand({"sok:1": {"target": None}}, [["sok:1", "migros:9"]])
        self.assertEqual(set(w), {"sok:1", "migros:9"})

    def test_alerts_only_after_baseline_and_on_real_changes(self):
        watch = {"sok:1": {"target": 30.0}, "sok:2": {"target": None}}
        prod = lambda pid, price, reg=None, promo="": {"id": pid, "name": pid, "market": "sok", "price": price,
                                                      "regular": reg or price, "promo": promo, "in_stock": True}
        sent = {}
        self.assertEqual(notify.watch_alerts(watch, {"sok:1": prod("sok:1", 35), "sok:2": prod("sok:2", 10)}, sent), [])
        # aynı fiyat: bildirim yok
        self.assertEqual(notify.watch_alerts(watch, {"sok:1": prod("sok:1", 35), "sok:2": prod("sok:2", 10)}, sent), [])
        lines = notify.watch_alerts(watch, {"sok:1": prod("sok:1", 29.5), "sok:2": prod("sok:2", 10, promo="2 Al 1 Öde")}, sent)
        txt = " ".join(t for _, t in lines)
        self.assertIn("hedef", txt)
        self.assertIn("2 Al 1 Öde", txt)
        # aynı kampanya ikinci kez bildirilmez
        self.assertEqual(notify.watch_alerts(watch, {"sok:1": prod("sok:1", 29.5), "sok:2": prod("sok:2", 10, promo="2 Al 1 Öde")}, sent), [])


    def test_multi_buy_promos_detected_and_grouped(self):
        prods = {f"migros:{i}": {"id": f"migros:{i}", "name": f"Ürün {i}", "market": "migros", "price": 10 + i,
                                 "in_stock": True, "promo": pr}
                 for i, pr in enumerate(["2 Al 1 Öde", "2.si %80 İndirimli", "Money kartlı fiyat", "3 Al 2 Öde", "2 al 1 öde"])}
        new = notify.new_promos(prods, {"promos": ["migros:3|3 Al 2 Öde"]})
        self.assertEqual(sorted(p["id"] for p, _ in new), ["migros:0", "migros:1", "migros:4"])
        lines = notify.promo_message(new, {"migros:4": {}})
        self.assertTrue(lines[0].startswith("2 Al 1 Öde (Migros, 2 ürün): ★ Ürün 4"))


if __name__ == "__main__":
    unittest.main()
