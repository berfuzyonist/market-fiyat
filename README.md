# Market Fiyat

Kişisel kullanım için market fiyat karşılaştırma uygulaması: https://berfuzyonist.github.io/market-fiyat/

- `index.html`: telefona kurulabilen uygulama (arama, indirimler, barkod, markete göre gruplanan liste). Aynı ürünü marketler arasında ad ve gramaja göre eşleştirir.
- `collector/collect.py`: fiyat toplayıcı. Migros tam kategori taraması geceleri; Şok tam kategori taraması günde iki kez (12 saatte bir) yapılır. İndirim taramaları Migros'ta saatlik, Şok'ta 30 dakikada birdir. Yalnızca herkese açık ve `robots.txt` dosyasının izin verdiği sayfaları okur, istekler arasında 3 saniye bekler, kendini açıkça tanıtır. Migros sayfa yanıtlarını aynı çalışma içinde önbelleğe alır ve sitemap kategorilerini önceden kapsanan kategori adlarıyla eşleştirerek gereksiz istekleri azaltır.
- `config.json`: bekleme süresi, kategori listeleri ve sınırlar.
- `data/<market>.json`: son başarılı fiyat verisi. `data/status-<market>.json`: son denemenin sonucu ve `last_attempt_by_mode` altında tam/indirim/aktüel modlarının ayrı son kayıtları. Başarısız veya eksik tarama durum kaydına yazılır ama fiyat verisini ve `data_updated` zamanını ileri taşımaz. Geçici ağ/5xx hataları sınırlı geri çekilmeyle yeniden denenir; 403/429 ve robots.txt engelleri aşılmaz. Kategori boşlukları, kampanya tarihinin kategoriye sızması, `Diğer` oranı, ürün düşüşü ve eski veri kalite uyarıları olarak kaydedilir.

Ajanlar: Migros gece tam tarama + saatlik indirim kontrolü; Şok günde iki tam tarama + 30 dakikada bir indirim kontrolü; BİM aktüel günde iki kez. A101 için yasal bir kaynak yok.

## Uygulama dosyaları
- `index.html`: sayfa iskeleti
- `css/app.css`: stiller
- `js/match.js`: aynı ürünü marketler arasında eşleştirme, birim fiyat, temel ihtiyaç kuralları
- `js/app.js`: arayüz (Ana sayfa, Karşılaştır, Kampanyalar, Keşfet, Ara, Listem)

Kampanyalar veri dosyalarında `promo` alanında tutulur: Migros çoklu alım rozetleri, Şok kampanya sayfası, BİM aktüel tarihleri.


GitHub Actions zamanlaması GitHub tarafında en iyi çaba esaslıdır; kesin dakikada başlama garantisi yoktur. Migros ve ŞOK'ta tam tarama ile indirim işlerinin concurrency grupları ayrıdır; böylece uzun tam tarama, daha sık gelen indirim kontrollerinin bekleyen çalıştırmalarını ezmez. Kod değişiklikleri ayrı test iş akışında doğrulanır.

Market tarayıcıları yalnızca planlı zamanlamalar veya açık `workflow_dispatch` isteğiyle çalışır; kod değişikliği itmeleri yalnızca birim testlerini çalıştırır. Concurrency grupları Git dalına göre de ayrılır; geliştirme dalındaki iş ana dalın planlı taramasını bekletmez.
