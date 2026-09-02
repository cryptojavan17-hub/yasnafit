'use strict';
// One place for the request-level security decisions so every surface (session cookies,
// CSRF check, rate limiting, response headers) agrees about what can be trusted.
//
// Behind a reverse proxy (nginx/caddy) the client IP, the requested host and the
// original protocol arrive in X-Forwarded-* headers that anyone on the internet can
// forge. They are therefore ignored unless YASNAFIT_TRUST_PROXY=1 is set, which is the
// operator's confirmation that the app is only reachable through that proxy.

const truthy=value=>/^(1|true|yes|on)$/i.test(String(value ?? '').trim());
const TRUST_PROXY=truthy(process.env.YASNAFIT_TRUST_PROXY);
const FORCE_SECURE_COOKIES=truthy(process.env.YASNAFIT_COOKIE_SECURE);
const PRODUCTION=String(process.env.NODE_ENV||'').trim().toLowerCase()==='production';
// Claiming the coach account is a once-in-a-lifetime action; doing it from the machine
// itself (or through an SSH tunnel) removes the race with whoever else scans the host.
const ALLOW_REMOTE_SETUP=truthy(process.env.YASNAFIT_ALLOW_REMOTE_SETUP);
// Emergency access to the coach 2FA key for hosts where the operator cannot read the
// volume (e.g. Railway without the CLI). Printing the key into the service log is a
// deliberate, temporary trade-off: the variable must be deleted right after use.
const REVEAL_AUTHENTICATOR_KEY=truthy(process.env.YASNAFIT_REVEAL_AUTHENTICATOR_KEY);
// Testing escape hatch: when set, a correct coach password opens a session without the
// 6-digit code. The TOTP key itself is NOT touched (nothing is lost when the variable is
// removed) — this only skips the step, so it must never stay on in a real deployment.
const ALLOW_2FA_SKIP=truthy(process.env.YASNAFIT_ALLOW_2FA_SKIP);
const LOOPBACK=/^(?:::1|::ffff:127\.|127\.|localhost$)/i;
function isLoopbackSocket(req){
  const peer=String(req?.socket?.remoteAddress||'');
  return LOOPBACK.test(peer);
}

function firstHeader(value){return String(value??'').split(',')[0].trim();}

// Requests are only counted per client IP when the socket address is meaningful.
function clientIp(req){
  const forwarded=TRUST_PROXY?firstHeader(req?.headers?.['x-forwarded-for']):'';
  return forwarded||req?.socket?.remoteAddress||'unknown';
}
function isHttps(req){
  if(FORCE_SECURE_COOKIES)return true;
  if(req?.socket?.encrypted)return true;
  return TRUST_PROXY&&firstHeader(req?.headers?.['x-forwarded-proto'])==='https';
}
function requestHost(req){
  const forwarded=TRUST_PROXY?firstHeader(req?.headers?.['x-forwarded-host']):'';
  return (forwarded||firstHeader(req?.headers?.host)||'').trim();
}
// Same-origin check for state-changing requests. Missing Origin (curl, health checks,
// native apps) is accepted because browsers always send one for cross-site requests.
function sameOrigin(req){
  const origin=req?.headers?.origin;
  if(!origin)return true;
  try{return new URL(origin).host===requestHost(req);}
  catch(error){return false;}
}

const CONTENT_SECURITY_POLICY=[
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

// Applied to every response, including static files and errors.
function securityHeaders(extra={}){
  return {
    'Content-Security-Policy':CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer',
    'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
    ...extra
  };
}
function applySecurityHeaders(res){
  const headers=securityHeaders();
  for(const [name,value] of Object.entries(headers)){
    try{res.setHeader(name,value);}catch(error){/* headers already flushed */}
  }
}
// Never echo database or library messages to the client; keep the operator-readable
// messages the services raise deliberately (they carry statusCode).
function clientErrorMessage(error,fallback='خطای داخلی سرور. در لاگ سرور توضیح دارد.'){
  const status=Number(error?.statusCode||0);
  if(status>=400&&status<500&&error?.message)return error.message;
  return fallback;
}

module.exports={
  TRUST_PROXY,FORCE_SECURE_COOKIES,PRODUCTION,ALLOW_REMOTE_SETUP,REVEAL_AUTHENTICATOR_KEY,ALLOW_2FA_SKIP,isLoopbackSocket,
  clientIp,isHttps,requestHost,sameOrigin,
  securityHeaders,applySecurityHeaders,clientErrorMessage,
  CONTENT_SECURITY_POLICY
};
