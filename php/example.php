<?php
require_once __DIR__ . '/UniversalTurnstile.php';

use UniversalCaptcha\UniversalTurnstile;

$turnstile = new UniversalTurnstile(
    getenv('TURNSTILE_SITE_KEY') ?: '1x00000000000000000000AA',
    getenv('TURNSTILE_SECRET_KEY') ?: '1x0000000000000000000000000000000AA'
);

$statusMessage = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $result = $turnstile->verify($_POST['cf-turnstile-response'] ?? '', $_SERVER['REMOTE_ADDR'] ?? null);
    $statusMessage = $result['success']
        ? 'Verifikasi Turnstile berhasil.'
        : 'Verifikasi gagal: ' . implode(', ', $result['error_codes']);
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Universal Turnstile Waiting Demo (PHP)</title>
  <link rel="stylesheet" href="../css/turnstile-waiting.css" />
</head>
<body>
  <?php if ($statusMessage !== ''): ?>
    <p><?= htmlspecialchars($statusMessage, ENT_QUOTES, 'UTF-8') ?></p>
  <?php endif; ?>

  <form data-tw-form method="post" action="">
    <input type="email" name="email" placeholder="nama@email.com" required />
    <?= $turnstile->render(['theme' => 'dark', 'size' => 'flexible', 'ready_text' => 'ayo masuk!']) ?>
    <button class="tw-submit" type="submit" disabled aria-disabled="true">Login</button>
  </form>

  <?= $turnstile->getTurnstileScriptTag('id') ?>
  <script src="../js/turnstile-waiting.js"></script>
  <script>
    TurnstileWaiting.init({ tipsUrl: '../data/auth-cyber-tips.json' });
  </script>
</body>
</html>
