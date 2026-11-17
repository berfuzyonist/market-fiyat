import unittest
from unittest.mock import MagicMock, patch
import urllib.error

from collector import collect


class CategoryInferenceTests(unittest.TestCase):
    def test_bim_common_products_are_classified(self):
        cases = {
            "Dost %20 Bitkisel Yağlı Kremsos 200 ml": "Süt & Süt Ürünleri",
            "KUMTEL 11 Dilim Yağlı Radyatör Isıtıcı": "Elektronik",
            "GÜRAL PORSELEN 18 PARÇA DESENLİ PORSELEN YEMEK TAKIMI": "Ev & Mutfak",
            "Gabby's Dollhouse 2'Li Dudak Balmı Seti": "Kişisel Bakım & Kozmetik",
            "AUTO POWER ANTİFRİZLİ OTO CAM SUYU -21°C": "Otomotiv & Aksesuar",
            "DOST TOYS PENGUEN DENGE OYUNU": "Oyuncak & Hobi",
            "Pierre Cardin KOL SAATİ ERKEK": "Giyim & Aksesuar",
            "Protein Ocn Aromasız Kreatin 750 g": "Spor & Takviye",
            "Dimes Kakaolu Protein Milkshake 310 ml": "Süt & Süt Ürünleri",
            "DOST TOYS PENGUEN DENGE OYUNU": "Oyuncak & Hobi",
            "HOMENDRA 2 KAPAKLI 2 ÇEKMECELİ GARDIROP": "Ev & Mutfak",
            "Naturalove Baskılı Mini Cep Mendili": "Kağıt Ürünleri",
            "Yurdum Bezelye Konservesi 830 g": "Bakliyat & Temel Gıda",
        }
        for name, expected in cases.items():
            with self.subTest(name=name):
                self.assertEqual(collect.infer_category(name), expected)

    def test_campaign_label_is_replaced_with_product_category(self):
        products = {
            "bim:1": {
                "name": "Gabby's Dollhouse Dudak Parlatıcı Seti",
                "cat": "Aktüel · 17 Kasım Salı",
            }
        }
        self.assertTrue(collect.complete_categories(products))
        self.assertEqual(products["bim:1"]["cat"], "Kişisel Bakım & Kozmetik")

    def test_quality_snapshot_counts_other_and_empty(self):
        products = {
            "1": {"cat": "Diğer"},
            "2": {"cat": ""},
            "3": {"cat": "Ev & Mutfak"},
        }
        quality = collect.category_quality(products)
        self.assertEqual(quality["other_count"], 1)
        self.assertEqual(quality["empty_category_count"], 1)
        self.assertEqual(quality["campaign_date_category_count"], 0)


class FetchRetryTests(unittest.TestCase):
    def test_temporary_network_error_is_retried(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers.get.return_value = ""
        response.read.return_value = b"ok"
        with patch.object(collect.time, "sleep"), patch.object(
            collect.urllib.request,
            "urlopen",
            side_effect=[OSError("temporary DNS failure"), response],
        ) as urlopen:
            status, body, size, attempts = collect._fetch(
                "https://example.invalid/robots.txt", "text/plain"
            )
        self.assertEqual(status, 200)
        self.assertEqual(body, "ok")
        self.assertEqual(size, 2)
        self.assertEqual(attempts, 2)
        self.assertEqual(urlopen.call_count, 2)

    def test_forbidden_response_is_not_retried(self):
        error = urllib.error.HTTPError(
            "https://example.invalid/robots.txt", 403, "Forbidden", {}, None
        )
        with patch.object(collect.time, "sleep"), patch.object(
            collect.urllib.request, "urlopen", side_effect=error
        ) as urlopen:
            status, body, size, attempts = collect._fetch(
                "https://example.invalid/robots.txt", "text/plain"
            )
        self.assertEqual(status, 403)
        self.assertEqual(attempts, 1)
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
