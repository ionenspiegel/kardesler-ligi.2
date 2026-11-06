# Kardeşler Ligi (takım tabanlı)
Gereksinim: Node 22.5+ (bağımlılık yok; `better-sqlite3` kuruluysa otomatik kullanılır).

1. `npm start`
2. İlk çalıştırmada konsolda **kurulum kodu** yazar. `http://localhost:3000/#/yonetici` adresinde bu kodla Yusuf'un şifresini belirle. Şifre kodda/dosyada tutulmaz (scrypt hash).
3. Tek yönetici: `yusuf`. Test: `npm test`.

Veri: `data/league.db` (`DB_PATH` ile değiştirilebilir). Eski tablolara dokunulmaz; yeni tablolar `kl_` ön ekiyle açılır. Eski `teams`/`matches` tabloları tanınırsa ilk açılışta kopyalanır.
Yayın: `NODE_ENV=production` + HTTPS, `data/` klasörünü kalıcı diske koy ve yedekle.
