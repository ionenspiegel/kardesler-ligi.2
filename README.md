# Kardeşler Ligi (takım tabanlı)
Gereksinim: Node 22+. Veritabanı: **PostgreSQL (Neon)** — bağlantı `DATABASE_URL` ortam değişkeninden okunur.

## Yerelde çalıştırma
1. `.env.local` içinde `DATABASE_URL=...` olmalı (GitHub'a gönderilmez).
2. `npm run dev` (= `node --env-file=.env.local server.js`).
3. Yönetici kaydı yoksa konsolda **kurulum kodu** yazar; `/#/yonetici` adresinde bu kodla Yusuf'un şifresini belirle (scrypt hash, DB'de saklanır).
4. Test: `npm test` (gerçek `kl_` tablolarına dokunmaz; geçici `klt_...` tablolarıyla çalışır ve sonunda yalnızca onları siler).

## Render
Environment: `DATABASE_URL` (Neon pooled bağlantı), `NODE_ENV=production`, `SESSION_SECRET` (uzun rastgele bir metin; verilmezse DB'de `kl_secret` tablosuna üretilip saklanır).
Yönetici kaydı yoksa kurulum kodu Render **Logs** ekranında görünür.

## Veri
Tablolar `kl_` ön ekiyle açılır (`CREATE TABLE IF NOT EXISTS`; hiçbir şey silinmez/DROP edilmez): `kl_admin, kl_teams, kl_matches, kl_settings, kl_secret`.
Eski SQLite yedeğini (JSON) aktarmak: `npm run import -- yedek.json` (deneme) ve `npm run import -- yedek.json --apply`.
