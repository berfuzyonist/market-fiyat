# Market Fiyat

Kişisel kullanım için market fiyat karşılaştırma uygulaması.

- `index.html`: telefona kurulabilen uygulama (arama, indirimler, barkod, markete göre gruplanan liste).
- `collector/collect.py`: fiyat toplayıcı. Yalnızca herkese açık ve `robots.txt` dosyasının izin verdiği sayfaları okur, istekler arasında bekler, kendini açıkça tanıtır.
- `config.json`: hangi kategorilerin toplanacağı ve bekleme süresi.
- `data/products.json`: toplanan fiyatlar. GitHub Actions günde üç kez günceller.

Durum: şu an yalnızca Migros'un iki kategorisi toplanıyor. Şok, BİM ve A101 henüz eklenmedi.
