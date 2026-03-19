function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Launchpad</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
</head>
<body>
  <nav class="container">
    <ul>
      <li><a href="/" class="brand"><img src="/icon.svg" alt="" width="28" height="28"> <strong>Launchpad</strong></a></li>
    </ul>
    <ul>
      <li><a href="/">Dashboard</a></li>
      <li><a href="/settings">Settings</a></li>
    </ul>
  </nav>
  <main class="container">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

module.exports = { layout };
