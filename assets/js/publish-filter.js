'use strict';

/**
 * Publication guard for The Rack.
 *
 * Production/reference boards can live near a project during development, but
 * they must never enter the public reading sequence. This guard sanitizes the
 * catalog response before the reader sees it. The canonical catalog should
 * still be kept clean; this is a second line of defense against accidental
 * publication.
 */
(() => {
  const originalFetch = window.fetch.bind(window);
  const EP1_ID = 'last-normal-night-issue-1';
  const forbidden = /(?:^|[\s/_-])(inside[-_ ]?front|reference|continuity|storyboard|contact[-_ ]?sheet|mood[-_ ]?board)(?:[\s/_.-]|$)/i;

  function isRackCatalog(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return false;
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin && /\/rack\.json$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function sanitizeCatalog(data) {
    if (!data || !Array.isArray(data.books)) return data;

    data.books.forEach((book) => {
      if (book?.id !== EP1_ID || !Array.isArray(book.sequence)) return;

      book.sequence = book.sequence.filter((item) => {
        const haystack = [item?.src, item?.title, item?.alt, item?.caption]
          .filter(Boolean)
          .join(' ');
        return !forbidden.test(haystack);
      });
    });

    return data;
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (!isRackCatalog(args[0]) || !response.ok) return response;

    try {
      const data = sanitizeCatalog(await response.clone().json());
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      console.error('Rack publication guard failed; using original catalog.', err);
      return response;
    }
  };
})();
