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
// A data attribute marks an image already rescued so a bad original cannot loop.

export const resizeFallbackScript = `(function(){var P='/cdn-cgi/image/';var R=/\\/cdn-cgi\\/image\\/[^/]*\\/(https?:\\/\\/.+)$/;document.addEventListener('error',function(e){var i=e.target;if(!i||i.tagName!=='IMG'||i.getAttribute('data-rsz-fb'))return;var c=i.currentSrc||i.src||'';if(c.indexOf(P)<0)return;i.setAttribute('data-rsz-fb','1');var p=i.parentNode;if(p&&p.tagName==='PICTURE'){var s=p.querySelectorAll('source');for(var k=0;k<s.length;k++){s[k].removeAttribute('srcset');s[k].removeAttribute('sizes');}}var a=i.getAttribute('src')||'';var m=R.exec(a);if(m){i.removeAttribute('srcset');i.removeAttribute('sizes');i.src=m[1];return;}if(i.hasAttribute('srcset')){i.removeAttribute('srcset');i.removeAttribute('sizes');i.src=a;}else{m=R.exec(c);if(m)i.src=m[1];}},true);})();`
