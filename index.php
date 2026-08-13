<?php
require_once __DIR__ . '/includes/bootstrap.php';
header('Content-Type: text/html; charset=utf-8');
$csrfToken = ensure_csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<meta name="csrf-token" content="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES); ?>">
<title>specs. — try on glasses</title>
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
<div id="app">
  <header class="topbar">
    <div>
      <div class="wordmark">specs<span class="dot">.</span></div>
      <div class="wordmark-rule"></div>
    </div>
    <div class="header-actions" id="headerActions" style="display:none;">
      <button class="icon-btn" id="resultsBtn" title="My try-ons" aria-label="My try-ons">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="11" r="1.6" fill="currentColor" stroke="none"/><path d="M21 16l-5.2-4.5a1.5 1.5 0 0 0-2 0L7 17"/></svg>
      </button>
      <button class="icon-btn" id="accountBtn" title="Account" aria-label="Account">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.2" r="3.4"/><path d="M5 20c0-3.5 3.1-6.2 7-6.2s7 2.7 7 6.2"/></svg>
      </button>
    </div>
  </header>
  <main id="view"></main>
  <nav class="bottombar" style="display:none;">
    <button class="navbtn" id="navSelfies" title="My selfies" aria-label="My selfies">
      <div class="pip"></div>
      <div class="icon-wrap">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="11" r="7.2"/>
          <circle cx="9.3" cy="10.2" r=".9" fill="currentColor" stroke="none"/>
          <circle cx="14.7" cy="10.2" r=".9" fill="currentColor" stroke="none"/>
          <path d="M9 14.2c.8.8 1.9 1.2 3 1.2s2.2-.4 3-1.2"/>
        </svg>
      </div>
      <span class="label">My selfies</span>
    </button>
    <button class="navbtn" id="navGlasses" title="My glasses" aria-label="My glasses">
      <div class="pip"></div>
      <div class="icon-wrap">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="6.3" cy="14" r="3.6"/>
          <circle cx="17.7" cy="14" r="3.6"/>
          <path d="M9.9 13.2h4.2M2.4 13 4 9.5c.4-.9 1.1-1.4 2-1.4M21.6 13 20 9.5c-.4-.9-1.1-1.4-2-1.4"/>
        </svg>
      </div>
      <span class="label">My glasses</span>
    </button>
  </nav>
</div>
<div id="toast-host"></div>
<script src="assets/js/app.js"></script>
</body>
</html>
