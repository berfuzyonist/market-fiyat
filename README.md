# Market Fiyat

Kişisel kullanım için market fiyat karşılaştırma uygulaması: https://berfuzyonist.github.io/market-fiyat/

- `index.html`: telefona kurulabilen uygulama (arama, indirimler, barkod, markete göre gruplanan liste). Aynı ürünü marketler arasında ad ve gramaja göre eşleştirir.
- `collector/collect.py`: fiyat toplayıcı. Migros ve Şok'un tam kategori taraması geceleri yapılır; indirim taramaları saatlik, Şok'ta 30 dakikada birdir. Yalnızca herkese açık ve `robots.txt` dosyasının izin verdiği sayfaları okur, istekler arasında 3 saniye bekler, kendini açıkça tanıtır. Migros sayfa yanıtlarını aynı çalışma içinde önbelleğe alır ve sitemap kategorilerini önceden kapsanan kategori adlarıyla eşleştirerek gereksiz istekleri azaltır.
- `config.json`: bekleme süresi, kategori listeleri ve sınırlar.
- `data/<market>.json`: son başarılı fiyat verisi. `data/status-<market>.json`: son denemenin sonucu. Başarısız veya eksik tarama, son başarılı veri zamanını ileri taşımaz. Boş ve kampanya-tarihi kategorileri ürün adına dayalı sınıflandırmayla tamamlanır.

Ajanlar: Migros ve Şok gece tam tarama + saat başı indirim kontrolü, BİM aktüel günde iki kez. A101 için yasal bir kaynak yok.
