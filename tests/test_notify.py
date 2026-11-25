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


if __name__ == "__main__":
    unittest.main()
