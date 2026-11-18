# Universal Turnstile & Waiting Ticker (`turnstile-waiting`)

Modul verifikasi Cloudflare Turnstile + animasi *waiting ticker* (`auth-cyber-tips.json`, 500 kalimat) yang **universal** dan bebas dependensi framework. Siap dipakai di proyek **HTML**, **PHP**, **JavaScript**, **TypeScript**, dan **CSS** dengan struktur folder apa pun.

## Preview

<video src="assets/preview.webm" controls muted playsinline width="360">
  <a href="assets/preview.webm">Lihat Video Preview (WebM)</a>
</video>

[Lihat Video Preview (assets/preview.webm)](assets/preview.webm)

## Struktur Paket

```text
├── css/
│   └── turnstile-waiting.css      # CSS universal dengan CSS variables (.tw-* & kompatibel .att-*)
├── js/
│   └── turnstile-waiting.js       # Modul JS universal (UMD: browser global, CommonJS, AMD)
├── ts/
│   └── turnstile-waiting.ts       # Implementasi & type definitions TypeScript murni
├── php/
│   ├── UniversalTurnstile.php     # Class PHP standalone (render + siteverify via cURL/stream)
│   └── example.php                # Contoh integrasi PHP lengkap
├── html/
│   └── example.html               # Contoh integrasi HTML statis
├── data/
│   └── auth-cyber-tips.json       # 500 kalimat edukasi keamanan siber & antibot
├── package.json
└── tsconfig.json
```

## Fitur Utama

1. **Zero Dependency**: Tidak memerlukan Bootstrap, jQuery, atau framework tertentu.
2. **Lazy Load JSON**: `auth-cyber-tips.json` hanya di-`fetch` ketika widget Turnstile sedang menunggu verifikasi.
3. **Auto Memory Cleanup**: Ketika verifikasi Turnstile selesai (`ready`), form disembunyikan, atau halaman ditinggalkan (`pagehide`), `releaseMemory()` membatalkan fetch berjalan (`AbortController.abort()`) dan mengosongkan array dari memori.
4. **Tema Fleksibel**: Mendukung tema gelap (default) dan terang (`data-tw-theme="light"`) via CSS custom properties (`--tw-text`, `--tw-accent`, `--tw-cursor`, `--tw-max-width`).

## Cara Pakai Cepat

### 1. HTML + JavaScript
```html
<link rel="stylesheet" href="css/turnstile-waiting.css" />
<form data-tw-form method="post">
  <div class="tw-turnstile-wrapper">
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
  </div>
  <div class="tw-ticker" data-ready-text="ayo masuk!" aria-live="polite">
    <div class="tw-slot"></div>
  </div>
  <button class="tw-submit" type="submit" disabled>Masuk</button>
</form>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?hl=id" async defer></script>
<script src="js/turnstile-waiting.js"></script>
<script>
  TurnstileWaiting.init({ tipsUrl: "./data/auth-cyber-tips.json" });
</script>
```

### 2. TypeScript / Bundler (Vite / Next.js / React / Vue)
```ts
import "./css/turnstile-waiting.css";
import { initTurnstileWaiting } from "./ts/turnstile-waiting";

const ctrl = initTurnstileWaiting({
  tipsUrl: "/assets/data/auth-cyber-tips.json",
  defaultReadyText: "siap lanjut!",
});
```

### 3. PHP Standalone
```php
use UniversalCaptcha\UniversalTurnstile;

$turnstile = new UniversalTurnstile($siteKey, $secretKey);
// Render widget + ticker
echo $turnstile->render(['theme' => 'dark', 'ready_text' => 'ayo masuk!']);

// Verifikasi di server saat POST
$check = $turnstile->verify($_POST['cf-turnstile-response'] ?? '', $_SERVER['REMOTE_ADDR'] ?? null);
if ($check['success']) {
    // Lolos verifikasi
}
```
