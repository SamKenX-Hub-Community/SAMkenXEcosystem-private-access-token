const CLOUDFLARE_PUB_KEY = "MIIBUjA9BgkqhkiG9w0BAQowMKANMAsGCWCGSAFlAwQCAqEaMBgGCSqGSIb3DQEBCDALBglghkgBZQMEAgKiAwIBMAOCAQ8AMIIBCgKCAQEA31_dzDPwYTZrxWRWlYcB8Qa2tiZ6VMUVDLNgLsLtl2jXDiF7i0JQjgWLS28X7o3-fgeKSh7290F1-6OksevONnjgwt2ejDqXZIQRqDpZX8ynZvRxsoU84fU48paBbEA8WrkIxtxT5vpf1xCodelaFfssNTg7I8ipFJNa_rCI3UGkkgTwkeytstZBCEhlkhAylZeNGI5KMP-j1-QboOEip5OkcI2zYycNF88l9pW8JBE3YRleUMwq42VX_EskAWOzu6MiZS38656zLoypug-44miauLTFVBQ1S-YTcuzm9AUEMJ_LlO6EbHAvtjvMzWzyDLaFWystwwadoVE7mqrwmwIDAQAB"
const CHALLENGE = "AAIAGXBhdC1pc3N1ZXIuY2xvdWRmbGFyZS5jb20AAAA=";
// const CHALLENGE_PREFIX = "AAIAHmRlbW8tcGF0Lmlzc3Vlci5jbG91ZGZsYXJlLmNvbSA"; // select cloudflare as origin
// const CHALLENGE_SUFFIX = "AAlcHJpdmF0ZS1hY2Nlc3MtdG9rZW4uY29saW5iZW5kZWxsLmRldg=="; // specify private-acccess-token.colinbendell.dev as origin

async function handleRequest(request) {
  if (!request.url.includes('/test.html')) {
    return fetch(request);
  }

  const query = request.url.split('?')[1]
  const challenge = query?.split('challenge=')[1]?.split('&')[0] || CHALLENGE;
//   const nonce = btoa(crypto.getRandomValues(new Uint16Array(33))).substring(1,43); // 31bytes (even though it should be 32)
//   const challenge = `${CHALLENGE_PREFIX}${nonce}${CHALLENGE_SUFFIX}`;

  const publicKey = query?.split('key=')[1]?.split('&')[0] || CLOUDFLARE_PUB_KEY;
  const tokenParam = query?.split('token=')[1]?.split('&')[0];
  const tokenHeader = request.headers.get("Authorization")?.split('PrivateToken token=')[1];

  const auth = tokenHeader || tokenParam;
  const respInit = auth ? { headers: {'Content-Type': `text/html`}} : {
    status: 401,
    headers: {
      'Content-Type': `text/html`,
      'WWW-Authenticate': `PrivateToken challenge=${challenge}, token-key=${publicKey}`,
    },
  };
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset='utf-8'>
  <meta http-equiv='X-UA-Compatible' content='IE=edge'>
  <title>${auth ? "PASS:" : "FAIL:"} Private Acccess Token Test</title>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <style>
      /* Box sizing rules */
      *,
      *::before,
      *::after {
          box-sizing: border-box;
      }

      /* Remove default margin */
      body,
      h1,
      h2,
      h3,
      h4,
      p,
      figure,
      blockquote,
      dl,
      dd {
          margin: 0;
          padding: 0;
          font-family: -apple-system, system-ui, sans-serif;
      }

      /* Remove list styles on ul, ol elements with a list role, which suggests default styling will be removed */
      ul[role="list"],
      ol[role="list"] {
          list-style: none;
      }

      /* Set core root defaults */
      html:focus-within {
          scroll-behavior: smooth;
      }

      /* Set core body defaults */
      body {
          min-height: 100vh;
          text-rendering: optimizeSpeed;
          line-height: 1.5;
      }

      /* A elements that don't have a class get default styles */
      a:not([class]) {
          text-decoration-skip-ink: auto;
      }

      /* Make images easier to work with */
      img,
      picture {
          max-width: 100%;
          display: block;
      }

      /* Inherit fonts for inputs and buttons */
      input,
      button,
      textarea,
      select {
          font: inherit;
      }

      html {
          max-width: 58ch;
          margin: auto;
          line-height: 1.75;
          font-size: 1.25em;
      }
      p,ul,ol {
          margin-bottom: 2em;
          color: #1d1d1d;
          font-family: sans-serif;
      }
      main {
          padding: 2rem;
      }
      select, code, input, details {
          display: block;
          width: 100%;
          margin-bottom: 0.5rem;
          font-family: 'Roboto Mono', monospace;
      }
      a[href]:hover {
          background-color: #f2f2f2;
      }
      a[href] {
          color: #22e;
          text-decoration: none;
      }

      code {
          border: 1px solid #eee;
          overflow-wrap: anywhere;
          background-color: #f9f9f9;
          font-size: 0.75rem;
      }
      .flex {
          display: inline-flex;
          width: 24rem;
          justify-content: space-between;
      }
      .flex > div {
          color: darkgray;
      }
  </style>
  <script>
      const PUBLIC_KEY = "${publicKey}";

      function getElement(id) {
          return document.getElementById(id).value;
      }

      function bin2str(value = []) {
          return value.map(char => String.fromCharCode(char)).join('');
      }

      function str2bin(data) {
          return data?.split('')?.map(char => char.charCodeAt(0)) || [];
      }

      function base64url(data) {
          return btoa(data).replace(/\\\+/g, '-').replace(/\\\//g, '_')
      }
      function base64urlDecode(data) {
          return atob(data?.replace(/-/g, '+')?.replace(/_/g, '/'))
      }

      function debugHex(name, value = []) {
          // hex encode
          // document.getElementById(name).innerHTML = "[" + value.map(v => v.toString(16).padStart(2, '0')).join(", ") + "]";

          // keep decimal encode - because humans
          document.getElementById(name).innerHTML = JSON.stringify(value).replaceAll(",", ", ");
      }

      function debugBool(name, value) {
          const status = value === null ? '❓' : (value ? '✅' : '❌')
          console.log(name, ":", status)
          document.querySelector("#" + name + "_test summary div span:last-child").textContent = status;            
      }

      function hexToByte(s) {
          return s?.replaceAll(/[^0-9a-z]/gi, '0')?.match(/.{1,2}/g)?.map(a => parseInt(a, 16));
      }

      function b642ab(base64_string){
          return Uint8Array.from(base64urlDecode(base64_string), c => c.charCodeAt(0));
      }

      function compareArray(a, b) {
          return a.toString() === b.toString();
      }
      async function parseToken() {
          const token = getElement("token");
          const binToken = str2bin(base64urlDecode(token)) || [];

          const tokenType = binToken.slice(0,2);
          const nonce = binToken.slice(2,34);
          const challenge = binToken.slice(34,66);
          const tokenKeyID = binToken.slice(66,98);
          const authenticator = binToken.slice(98);

          debugHex('token_type', tokenType);
          debugHex('nonce', nonce);
          debugHex('challenge_digest', challenge);
          debugHex('token_key_id', tokenKeyID);
          debugHex('authenticator', authenticator);

          const expectedChallenge = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(str2bin(base64urlDecode("${challenge}"))))));
          debugBool('token', token.length > 0);
          debugBool('token_type', compareArray(tokenType, [0,2]));
          debugBool('nonce', nonce.length === 32);
          debugBool('challenge_digest', compareArray(expectedChallenge, challenge));
          debugBool('token_key_id', tokenKeyID.length === 32);
          debugBool('authenticator', authenticator.length === 256);

          // sadly WebCrypto support for rsa-pss on Chrome/WebKit is missing. Works on Firefox
          try {
              const publicKey = await crypto.subtle.importKey("spki", b642ab(PUBLIC_KEY), { name: "RSA-PSS", hash: "SHA-384" }, false, ["verify"])
              const data = Uint8Array.from(binToken.slice(0,98));
              const signature = Uint8Array.from(binToken.slice(98));
              const valid = await crypto.subtle.verify({name:"RSA-PSS", saltLength: 48},  publicKey, signature, data);
              debugBool('token_valid', valid);
          }
          catch (e) {
              console.error(e);
              debugBool('token_valid', null);
          }
          if (token.length === 0) {
              debugBool('token_valid', false);
          }
          return token;
      }

      function init() {
          parseToken();
          [...document.getElementsByTagName('input')].forEach(s => s.addEventListener('change', parseToken));
          [...document.getElementsByTagName('input')].forEach(s => s.addEventListener('click', parseToken));
      }

      window.addEventListener('load', init);
  </script>
</head>
<body>
<main>
  <h1>Public Access Token Test</h1>
  ${auth ? "" : "<div style='margin: -0.6rem 0 0.6rem 0;'>😵😩 No Public-Access-Token for you.</div>"}
  <div  style="vertical-align: super; font-size: 0.75rem; margin: -0.6rem 0 0.6rem 0;">
          [<a href="https://github.com/colinbendell/private-access-token/blob/main/README.md">Notes</a>]
          [<a href="https://github.com/colinbendell/private-access-token">Github Source</a>]
          [<a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-protocol-06.html">IETF Draft</a>]
  </div>
  <details id="token_test">
    <summary><div class="flex">
        <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-auth-scheme-05.html#name-token-redemption">PrivateToken</a> token=</div>
        <span>❌</span>
    </div></summary>
    <input id="token" type="text" disabled value="${auth}">
  </details>
  <details id="token_type_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-protocol-06.html#section-8.1">token_type</a> == 0x0002</div>
          <span>❌</span>
      </div></summary>
      <code id="token_type"></code>
  </details>
  <details id="nonce_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-auth-scheme-05.html#section-2.2-4.2">nonce</a> .length()==256</div>
          <span>❌</span>
      </div></summary>
      <code id="nonce"></code>
  </details>
  <details id="challenge_digest_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-auth-scheme-05.html#section-2.2-4.3">challenge_digest</a> == sha256(challenge)</div>
          <span>❌</span>
      </div></summary>
      <code id="challenge_digest"></code>
  </details>
  <details id="token_key_id_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-auth-scheme-05.html#section-2.2-4.4">token_key_id</a> .length()==32</div>
          <span>❌</span>
      </div></summary>
      <code id="token_key_id"></code>
  </details>
  <details id="authenticator_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-auth-scheme-05.html#section-2.2-4.4">authenticator</a> .length()==256</div>
          <span>❌</span>
      </div></summary>
      <code id="authenticator"></code>
  </details>
  <details id="token_valid_test">
      <summary><div class="flex">
          <div><a href="https://www.ietf.org/archive/id/draft-ietf-privacypass-protocol-06.html#name-token-verification-2">RSA-Verify</a>(token[0-98], publicKey, authenticator)</div>
          <span>❌</span>
      </div></summary>
      <code><em>NB: Safari, Chrome and Cloudflare Workers do not support <a href="https://github.com/w3c/webcrypto/issues/307">oid=RSARSS-PSS in WebCrypto.validate()</a></em></code>
  </details>
</main>
</body>
</html>
`, respInit);
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
