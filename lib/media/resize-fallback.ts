// When Cloudflare will not resize, show the original instead.
//
// resizedImageSrc() (resize-url.ts) points <img srcset> at Cloudflare's
// /cdn-cgi/image/ endpoint. That endpoint can refuse: the free plan's unique
// transformation quota runs out (ERROR 9422, HTTP 429), Transformations gets
// switched off in the zone, or the zone has an outage. A failed srcset candidate
// does NOT fall back to `src` - the browser reports an error and draws nothing - so
// on deskwell.co.uk in November 2026 every main product photo went blank while the
// thumbnails (served direct) and the hover zoom (original url) kept working.
//
// The fix is one capture-phase listener, installed from an inline script in the
// root layout's <head> so it exists before the first <img> is parsed. `error` does
// not bubble, but it can be caught in the capture phase on `document`. It covers
// every picture on the site in one place, including ones inside client islands and
// modules, rather than an onError prop threaded through each tag.
//
// What it does for an <img> whose failed request was a /cdn-cgi/image/ url:
//   - has a srcset: drop srcset and sizes (and those of any sibling <source>), so
//     the browser re-picks and loads `src`, which responsiveImg() always keeps as the
//     original;
//   - otherwise, or if `src` is itself a transformed url: swap `src` for the original
//     url embedded after the options segment.
//
// NOT "once per image". The first version marked an <img> as rescued and never
// touched it again, and a product gallery reuses ONE <img> for every photo: picking
// a variation hands that same element a fresh srcset, so the first photo was
// rescued and every variation after it drew the broken-picture icon (Deskwell,
// 19 November 2026). Every failure is rescued instead. It cannot loop: the script
// acts only when the failed request was a /cdn-cgi/image/ one, and what it loads
// in its place never is - an original that also fails is left alone. The request
// counts as transformed when currentSrc, srcset or src holds a /cdn-cgi/image/
// url: a rescue removes srcset and leaves src the original, so a second failure
// after a rescue has none of the three and is ignored.

export const resizeFallbackScript = `(function(){var P='/cdn-cgi/image/';var R=/\\/cdn-cgi\\/image\\/[^/]*\\/(https?:\\/\\/.+)$/;document.addEventListener('error',function(e){var i=e.target;if(!i||i.tagName!=='IMG')return;var c=i.currentSrc||'';var ss=i.getAttribute('srcset')||'';var a=i.getAttribute('src')||'';if(c.indexOf(P)<0&&ss.indexOf(P)<0&&a.indexOf(P)<0)return;var p=i.parentNode;if(p&&p.tagName==='PICTURE'){var s=p.querySelectorAll('source');for(var k=0;k<s.length;k++){s[k].removeAttribute('srcset');s[k].removeAttribute('sizes');}}var m=R.exec(a);if(m){i.removeAttribute('srcset');i.removeAttribute('sizes');i.src=m[1];return;}if(ss){i.removeAttribute('srcset');i.removeAttribute('sizes');i.src=a;}else{m=R.exec(c);if(m)i.src=m[1];}},true);})();`
