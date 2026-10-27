// HTTP Basic auth for the CMS. The password lives in the CMS_PASSWORD environment variable;
// with no password set, everything under /admin is refused (fail closed).
export function checkAuth(req: Request, password: string | undefined): Response | null {
  if (!password) return new Response('CMS is disabled: set CMS_PASSWORD in the Netlify environment.', { status: 503 });
  const header = req.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const given = decoded.slice(decoded.indexOf(':') + 1);
    if (safeEqual(given, password)) return null;
  }
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Eurofizzion CMS", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
