Optional copy of StPageFlip (npm package `page-flip`) for air-gapped / "no CDN" deploys.

`assets/js/app.js` loads the library by fetching JS text and executing it from a blob: URL
(same-origin execution). Default order: CDN first, then ./vendor/page-flip.browser.min.js.

Populate vendor (once):

  PowerShell: .\scripts\pull-page-flip.ps1

Or save manually as vendor/page-flip.browser.min.js from:

  https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js
