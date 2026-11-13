# Market Fiyat

Kişisel kullanım için market fiyat karşılaştırma uygulaması: https://berfuzyonist.github.io/market-fiyat/

- `index.html`: telefona kurulabilen uygulama (arama, indirimler, barkod, markete göre gruplanan liste). Aynı ürünü marketler arasında ad ve gramaja göre eşleştirir.
- `collector/collect.py`: fiyat toplayıcı. Migros ve Şok'un tüm kategorilerini her gece bir kez tarar. Yalnızca herkese açık ve `robots.txt` dosyasının izin verdiği sayfaları okur, istekler arasında bekler, kendini açıkça tanıtır.
- `config.json`: bekleme süresi, kategori listeleri ve sınırlar.
- `data/products.json`: toplanan fiyatlar. `data/status.json`: son çalışmanın özeti (ürün sayısı, istek sayısı, hatalar).

Ajanlar: Migros ve Şok gece tam tarama + saat başı indirim kontrolü, BİM aktüel günde iki kez. A101 için yasal bir kaynak yok.
