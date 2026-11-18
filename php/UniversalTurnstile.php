<?php

namespace UniversalCaptcha;

/**
 * Universal Cloudflare Turnstile + Waiting Ticker Helper (Zero Framework Dependency)
 */
class UniversalTurnstile
{
    private string $siteKey;
    private string $secretKey;
    private string $verifyEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public function __construct(string $siteKey, string $secretKey)
    {
        $this->siteKey = trim($siteKey);
        $this->secretKey = trim($secretKey);
    }

    public function isConfigured(): bool
    {
        return $this->siteKey !== '' && $this->secretKey !== '';
    }

    /**
     * Render widget Turnstile + ticker waiting HTML.
     *
     * @param array{theme?:string,size?:string,ready_text?:string} $options
     */
    public function render(array $options = []): string
    {
        if (!$this->isConfigured()) {
            return '';
        }

        $theme = in_array($options['theme'] ?? 'auto', ['light', 'dark', 'auto'], true) ? $options['theme'] : 'auto';
        $size = in_array($options['size'] ?? 'flexible', ['normal', 'compact', 'flexible', 'invisible'], true) ? $options['size'] : 'flexible';
        $readyText = htmlspecialchars((string) ($options['ready_text'] ?? 'siap lanjut!'), ENT_QUOTES, 'UTF-8');
        $siteKey = htmlspecialchars($this->siteKey, ENT_QUOTES, 'UTF-8');

        $html = '<div class="tw-turnstile-wrapper">';
        if ($size === 'invisible') {
            $html .= '<div class="cf-turnstile" data-size="invisible" data-sitekey="' . $siteKey . '"></div>';
        } else {
            $html .= '<div class="cf-turnstile" data-size="' . $size . '" data-theme="' . $theme . '" data-sitekey="' . $siteKey . '"></div>';
        }
        $html .= '</div>';
        $html .= '<div class="tw-ticker" data-ready-text="' . $readyText . '" aria-live="polite"><div class="tw-slot"></div></div>';

        return $html;
    }

    public function getTurnstileScriptTag(string $lang = 'id'): string
    {
        $hl = htmlspecialchars($lang, ENT_QUOTES, 'UTF-8');
        return '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?hl=' . $hl . '" async defer></script>';
    }

    /**
     * Verifikasi token cf-turnstile-response ke Cloudflare API.
     *
     * @return array{success:bool,error_codes:array<int,string>,raw:array<string,mixed>}
     */
    public function verify(?string $token, ?string $remoteIp = null): array
    {
        $token = trim((string) $token);
        if (!$this->isConfigured() || $token === '') {
            return ['success' => false, 'error_codes' => ['missing-input-response'], 'raw' => []];
        }

        $payload = [
            'secret' => $this->secretKey,
            'response' => $token,
        ];
        if ($remoteIp !== null && $remoteIp !== '') {
            $payload['remoteip'] = $remoteIp;
        }

        $body = $this->httpPostForm($this->verifyEndpoint, $payload);
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if (!is_array($decoded)) {
            return ['success' => false, 'error_codes' => ['network-or-invalid-json'], 'raw' => []];
        }

        return [
            'success' => !empty($decoded['success']),
            'error_codes' => isset($decoded['error-codes']) && is_array($decoded['error-codes']) ? $decoded['error-codes'] : [],
            'raw' => $decoded,
        ];
    }

    private function httpPostForm(string $url, array $data): ?string
    {
        $encoded = http_build_query($data);

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $encoded,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $result = curl_exec($ch);
            curl_close($ch);
            return is_string($result) ? $result : null;
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $encoded,
                'timeout' => 10,
            ],
        ]);
        $result = @file_get_contents($url, false, $context);
        return is_string($result) ? $result : null;
    }
}
