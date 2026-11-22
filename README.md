# Market Fiyat

Kişisel kullanım için market fiyat karşılaştırma uygulaması: https://berfuzyonist.github.io/market-fiyat/

Şok, Migros ve BİM'in herkese açık sitelerindeki fiyatları GitHub Actions ile toplar, GitHub Pages'te yayımlar. Sunucu, veritabanı veya ücretli altyapı yoktur. A101 için bot korumasını aşmadan kullanılabilecek yasal bir kaynak bulunmadığından A101 verisi yoktur.

## Mimari

```
GitHub Actions (zamanlanmış)          GitHub Actions (talep)
 migros.yml / sok.yml / bim.yml        update-one-product.yml
        │ collector/collect.py                │ scripts/update_one_product.py
        │ scripts/publish-market-data.sh      │ (tek ürün isteği)
        ▼                                     ▼
   data/<market>.json, status-<market>.json, history-<market>.json, price-checks.json
        │  (main dalına commit → GitHub Pages)
        ▼
 index.html + js/match.js + js/core.js + js/app.js  (telefonda çalışan arayüz)
```

## Veri kaynakları

| Market | Katalog | İndirim | Tek ürün kontrolü |
|---|---|---|---|
| Migros | `rest/search/screens/<kategori>` (gece tam tarama) | Money indirimli + çoklu indirim listeleri (saatlik) | `rest/products/screens/<20000000000000+SKU>` (1 istek) |
| Şok | Kategori sayfaları (günde 2 tam tarama) | İndirimli ürünler + kampanyalar sayfası (30 dk) | Ürün sayfası (1 istek) |
| BİM | Yalnızca aktüel/indirim sayfaları (günde 2) | Aynı | Aktüel ürün sayfası (1 istek) |

Kurallar: yalnızca `robots.txt` dosyasının izin verdiği adresler okunur (Migros ve Şok'ta `/arama` yasak, kullanılmaz); istekler arasında 3 sn beklenir; program kendini `User-Agent` ile açıkça tanıtır; 403/429 alınırsa market için durulur, yeniden denenmez; bot koruması aşılmaz.

Bilinen alan durumu: ad, fiyat, normal fiyat, stok, görsel, adres ve kampanya metni kaynaktan gelir. Kategori Migros/Şok'ta kaynaktan, BİM'de ürün adından tahmin edilir (`Diğer` oranı durum dosyasında raporlanır). BİM stok bilgisi yayımlamaz. Migros'ta indirimli fiyat yalnızca Money üyelerine geçerliyse `promo` alanına `Money kartlı fiyat` yazılır ve arayüzde "Money ile" etiketi gösterilir.

## Veri toplama akışı ve güvenlik ağları

1. `collect.py <market> <mod>` kaynaktan okur.
2. `validate_products` her kaydı denetler: kimlik/ad boş olamaz, kimlik market biçimine uymalı, fiyat sonlu ve > 0 olmalı; normal fiyat güncel fiyattan düşükse veya indirim %90'ı aşıyorsa indirim üretilmez; market dışı adres silinir. Geçersiz kayıt yayımlanmaz, eski hali kalır; sayılar `data_quality` alanında raporlanır.
3. Tam tarama yarıda kalırsa (403/429, ağ hatası) ya da şüpheli derecede az ürün dönerse katalog silinmez; **okunan ürünlerin fiyatları yine yayımlanır** (`partial: true`), okunamayanlar önceki doğrulamasıyla kalır ve arayüzde "eski veri" olarak işaretlenir. 10 gündür hiçbir taramada görülmeyen ürün katalogdan çıkarılır. Site haritasında kalmış ama kaldırılmış (404) Migros kategorileri atlanır; yalnızca keşif denemelerinin yarısından fazlası 404 ise tarama durur.
4. Dosyalar geçici dosyaya yazılır, JSON olarak doğrulanır, `os.replace` ile atomik olarak değiştirilir. Boş katalog asla yazılmaz.
5. `publish-market-data.sh` her denemede en güncel `main` üzerine yeniden kurar (rebase yok), yalnızca daha yeni ve başarılı (ya da kısmi) veriyi yayımlar; başarısız denemeler yalnızca durum kaydını günceller.
6. Yayımlarken katalog `scripts/datamerge.py` ile **ürün bazında** birleştirilir: aynı ürün için son doğrulama zamanı (`seen`) daha yeni olan satır kalır. Böylece 2 saat süren Migros taraması, bu sürede saatlik indirim taramasının veya "Fiyatı Güncelle"nin yazdığı daha yeni fiyatı ezmez. Eksiksiz tam taramada katalogda olmayan ürün, tarama başladıktan sonra doğrulanmamışsa düşer.

## İş akışları

| Dosya | Tetikleyici | Not |
|---|---|---|
| `migros.yml` | günde 2 tam (TR 03:17 ve 14:17), saatlik indirim | tam ve indirim concurrency grupları ayrı |
| `sok.yml` | günde 2 tam, 30 dk'da bir indirim | |
| `bim.yml` | günde 2 aktüel | |
| `update-one-product.yml` | `[FİYAT GÜNCELLE]` başlıklı talep (issue) | yalnızca OWNER/MEMBER/COLLABORATOR; sıralı; 10 dk zaman aşımı |
| `tests.yml` | PR ve main dışı itmeler | Python + JavaScript testleri, JSON doğrulama |
| `posters.yml` | günde 2 (TR 08:43, 16:43) | BİM "Afişler" sayfası ve Şok kampanyalar sayfası (her biri tek istek) → `data/posters-<market>.json`. Görseller indirilmez, marketin kendi adresleri listelenir. Migros için ana sayfadaki kampanya görselleri (`/rest/banners/main-page-slider` ve `main-page-under-slider`) ve her görselin bağlandığı ürün listesi (`/rest/search/screens/<ad>-l-<hex>`, kampanya başına en çok 10 sayfa) okunur; `data/posters-migros.json` kapakları ve kampanya ürünlerini ana veriyle aynı sıkıştırılmış biçimde tutar. Arayüzde her kampanyanın orijinal kapağıyla kendi sayfası vardır (`#afis/<liste>`; Şok kampanyalarında ürünler kampanyanın `skuIds` alanından, BİM afişlerinde aynı tarihli aktüel ürünlerden gelir); listedeki ürün katalogda yoksa eklenir, liste daha yeni okunduysa fiyatı güncellenir. A101 otomatik erişime kapalı olduğu için yalnızca kendi sayfasına bağlantı gösterilir. |
| `health.yml` | 3 saatte bir | `scripts/health.py`: veri yaşı (Migros/Şok 6 sa, BİM 30 sa) ve son 48 saatte doğrulanan ürün oranı; sorun varsa `[SAĞLIK]` talebi açar/günceller, düzelince kapatır. Depoya yazmaz. |

GitHub Actions zamanlaması en iyi çaba esaslıdır; dakikası garanti değildir.

## Fiyat güncel mi? (herkes için, kayıt yapmaz)

Her ürünün ayrıntısında **Fiyat güncel mi?** düğmesi vardır. GitHub hesabı gerektirmez, hiçbir veri yazmaz. Market siteleri başka sitelerden tarayıcı isteğine izin vermediği (CORS başlığı yok) ve proje harici sunucu kullanmadığı için uygulama canlı fiyatı kendisi okuyamaz; karar, fiyatın marketin sitesinden en son ne zaman doğrulandığına (`seen`) ve marketin son tarama sonucuna göre verilir:

- 6 saatten yeni: **Güncel**
- 6–30 saat: **Büyük olasılıkla güncel**
- 30 saatten eski veya bilinmiyor: **Eski olabilir**
- BİM tarihi gelmemiş/geçmiş ürün: **Henüz satışta değil / Satış dönemi geçmiş**

Son otomatik tarama başarısızsa bu ayrıca söylenir. Panelde marketin ürün sayfasına canlı fiyatı görmek için bağlantı bulunur.

## Fiyatı Güncelle (depo sahibi için, tek ürün kontrolü)

GitHub hesabı ve depoda yetki gerektirir; sonucu veriye kaydeder. Arayüzde "Fiyat güncel mi?" panelinin altında ikincil bağlantı olarak durur.


1. Uygulamada ürün kartındaki veya ürün ayrıntısındaki **Fiyatı Güncelle** GitHub'da hazır doldurulmuş bir talep sayfası açar; **Create** ile gönderilir. Talep gövdesinde gizli işaret vardır: `{"market","id","name"}`.
2. İş akışı işareti doğrular (market, kimlik biçimi, ürünün katalogda olması, adın kayıtla aynı olması). Elle değiştirilmiş/sahte talepler markete istek atılmadan reddedilir. Kullanıcı metni kabuğa gömülmez, yalnızca ortam değişkeniyle Python'a aktarılır.
3. Ürün **tek istekle** kaynaktan okunur (robots.txt + ürün). Bütün katalog taranmaz. Aynı ürün 10 dakika içinde yeniden sorgulanmaz.
4. Kaynaktaki ad kayıtla örtüşmüyorsa, fiyat geçersizse, ürün 404 ise veya site hata verirse **"Ürün doğrulanamadı"** yazılır; eski fiyat korunur.
5. Sonuç en güncel `main` üzerine uygulanır (8 denemeye kadar): yalnızca o ürünün satırı (`price`, `regular`, `in_stock`, `seen`), `data/price-checks.json` ve fiyat geçmişi güncellenir. Katalogun `updated` zamanı değiştirilmez; böylece saatlik taramaların yayımlanması engellenmez. Arayüz, daha yeni olan kontrol sonucunu katalogdaki satırın üzerine uygular.
6. Talebe ürün adı, market, önceki/yeni fiyat, değişim tutarı ve yüzdesi, stok, kontrol zamanı ve sonuç yorum olarak yazılır, talep kapatılır.

## Fiyat geçmişi

`data/history-<market>.json`: `items[id] = [[unix_saniye, fiyat, normal_fiyat, kaynak], ...]`. Yalnızca gerçek değişimler yazılır (aynı fiyat tekrar eklenmez). Kaynak: `full`, `deals`, `aktuel`, `manual`, ilk noktada `önceki`. Ürün başına en fazla 12 nokta, 180 günden eski noktalar silinir. Geçmiş, yayımlanan iki sürüm karşılaştırılarak `publish-market-data.sh` içinde çıkarılır; yazılamazsa fiyat yayımlanması engellenmez.

## JSON biçimi

`data/<market>.json`:

```json
{"updated":"ISO 8601 UTC","market":"sok","prefix":{"sok":{"image":"…","url":"…"}},"cats":{"sok":["…"]},
 "fields":["id","name","price","regular","in_stock","image","url","cat","promo","seen"],
 "products":[["sok:10","Crown Cola Pet 250 ml",14.0,14.0,1,"<görsel eki>","<adres eki>",20,"",1795242028]]}
```

`seen` (Unix saniye) ürünün kaynaktan en son doğrulandığı andır; 48 saatten eski doğrulamada arayüz indirim göstermez ve "eski veri" uyarısı verir. Eski 9 sütunlu dosyalar hem Python hem JavaScript tarafından okunur (`seen` yoksa dosyanın `updated` zamanı kullanılır).

`data/status-<market>.json`: `started_at`, `finished_at`/`checked_at` (son deneme), `last_successful_data_at`/`data_updated` (son başarılı veri), `status`, `complete`, `collected_products` (bu denemede okunan), `total_products` (yayımlanan katalog), `discounted_products`, `invalid_products`, `data_quality`, `duration_seconds`, `errors`, `quality_warnings`, `run_id`, `last_attempt_by_mode`. Başarısız deneme son başarılı veri zamanını silmez.

`data/price-checks.json`: `{"v":1,"checks":{id:{status:"updated|unchanged|failed",checked_at,old_price,new_price,change,change_pct,in_stock,message,issue}}}` (en fazla 1500 kayıt).

## Arayüz kuralları

- BİM aktüel tarihi henüz gelmediyse ürün "Yakında" gösterilir, listede en ucuz seçilmez; süresi biten indirim dönemleri ve 21 günden eski aktüeller indirim/kampanya listelerine girmez.
- Normal fiyat güncel değilse (eski doğrulama) indirim yüzdesi üretilmez.
- Arama 150 ms gecikmeyle çalışır; görseller tembel yüklenir, bozuk görsel gizlenir.

## Yerel geliştirme ve testler

```bash
python3 -m unittest discover -s tests -v      # toplayıcı, tek ürün kontrolü, geçmiş (ağ taklit edilir)
node --test tests/js/*.test.js                # js/core.js
python3 -m http.server 8000                   # arayüz: http://localhost:8000
python3 collector/collect.py sok deals        # gerçek kaynaktan okur, data/ altına yazar
```

Hata ayıklama: Actions çalıştırma kaydında toplayıcı durum JSON'unu yazdırır; ayrıca `data/status-<market>.json` içindeki `status`, `notes`, `quality_warnings` ve `last_attempt_by_mode` alanlarına bakın.

## Gizli bilgiler ve güvenlik

Hiçbir API anahtarı veya parola kullanılmaz; iş akışları yalnızca GitHub'ın verdiği `GITHUB_TOKEN` ile çalışır (`contents: write`, talep işinde `issues: write`, test işinde `contents: read`). Talep içeriği kabuk komutuna dönüştürülmez. Arayüz tüm metinleri HTML'e kaçışla yazar.

## Bilinen kısıtlamalar

- Fiyatlar marketlerin online fiyatıdır; şube rafındaki fiyat ve stok farklı olabilir. Migros fiyatı varsayılan mağaza için döner; bölge seçimi yapılmaz.
- BİM yalnızca aktüel ürünleri yayımlar; stok bilgisi yoktur.
- Şok ürün sayfası yaklaşık 0,5 MB'tır; tek ürün kontrolü yine de tek istektir.
- Tek ürün kontrolü GitHub hesabıyla talep açmayı gerektirir (uygulamada anahtar saklanmaz).
- Migros tam taraması ~1,5-2 saat sürer ve zaman zaman 403 (erişim sınırı) ile durur; bu durumda eski veri korunur.

## Kullanım kolaylıkları

- **Arama alakası** (`MFC.searchScore`): Türkçe karaktersiz eşleşir ("sut" → "süt"); kelimenin adda tek başına
  ya da sonda (asıl ürün) geçmesi öne, türevleri ("Yumurtalı", "Püresi", "Süzgeci") geriye alınır; en alakalı
  sonuçların çoğunun bulunduğu bölüm (yumurta → kahvaltılık) öne çıkar.
- **Liste**: serbest notlar ("ekmek"), WhatsApp/SMS ile metin olarak paylaşma, aynı tür ve benzer boyda birim
  fiyatı en az %5 ucuz muadil önerisi (tek dokunuşla değiştirme). Ürün sayfasında da en çok 3 muadil gösterilir.
- **Çevrimdışı** (`sw.js`): her istek önce internetten yapılır; bağlantı yoksa son kaydedilen sürüm açılır.
