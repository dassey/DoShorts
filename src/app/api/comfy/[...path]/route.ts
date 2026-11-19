// Bridge from the DoShorts page to a ComfyUI running on the user's machine or LAN.
//
// ComfyUI rejects browser requests from other origins, so the page cannot call
// it directly without the user restarting ComfyUI with special flags. This
// route relays the handful of calls Generate needs. Because it makes requests
// on a caller's behalf, it is deliberately narrow:
//   - it only works when DoShorts itself is being used locally
//   - it only accepts requests made by the DoShorts page (same origin)
//   - it only talks to loopback or private-network addresses
//   - it only relays a fixed list of ComfyUI endpoints
//   - whatever comes back is served inert: it can never run as a page here

const ROUTES: { method: "GET" | "POST"; path: RegExp }[] = [
  { method: "GET", path: /^system_stats$/ },
  { method: "GET", path: /^models\/[a-z_]+$/ },
  { method: "GET", path: /^history\/[\w-]+$/ },
  { method: "GET", path: /^view$/ },
  { method: "POST", path: /^prompt$/ },
  { method: "POST", path: /^interrupt$/ },
  // A voice sample for cloning. Passed through as the browser's form upload.
  { method: "POST", path: /^upload\/image$/ },
];

const MAX_UPLOAD = 25 * 1024 * 1024;

const SAFE_TYPES = /^(application\/json|image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime|x-matroska)|audio\/[\w.+-]+)\b/i;

/** localhost, loopback, or a private-range IPv4 literal. No DNS names, so nothing can be re-pointed. */
function isLocalHost(host: string): boolean {
  if (host === "localhost" || host === "[::1]") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function refuse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function relay(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const setting = process.env.DOSHORTS_COMFY_BRIDGE;
  if (setting === "0") return refuse("The ComfyUI bridge is turned off on this server.", 403);

  const url = new URL(request.url);
  const servedLocally = isLocalHost((request.headers.get("host") ?? "").replace(/:\d+$/, ""));
  if (!servedLocally && setting !== "1") {
    return refuse("Generate works when DoShorts runs on your own machine or network.", 403);
  }
  // Browsers label every request with where it came from. Only this site's own pages may use the bridge.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return refuse("Cross-site request refused.", 403);

  const path = (await params).path.join("/");
  if (!ROUTES.some((r) => r.method === request.method && r.path.test(path))) {
    return refuse("That ComfyUI endpoint is not available through DoShorts.", 404);
  }

  const host = url.searchParams.get("h") ?? "";
  const port = Number(url.searchParams.get("p"));
  if (!isLocalHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return refuse("ComfyUI must be at a local address, such as 127.0.0.1 or 192.168.x.x.", 400);
  }

  const target = new URL(`http://${host}:${port}/${path}`);
  url.searchParams.forEach((value, key) => {
    if (key !== "h" && key !== "p") target.searchParams.append(key, value);
  });

  const contentType = request.headers.get("content-type") ?? "";
  const isUpload = path === "upload/image";
  if (isUpload && !contentType.startsWith("multipart/form-data")) return refuse("Expected a file upload.", 400);
  if (isUpload && Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD) {
    return refuse("That file is too large. Use a sample under 25 MB.", 413);
  }

  let upstream: Response;
  try {
    const range = request.headers.get("range");
    const body = request.method !== "POST" ? undefined : isUpload ? await request.arrayBuffer() : await request.text();
    if (body instanceof ArrayBuffer && body.byteLength > MAX_UPLOAD) {
      return refuse("That file is too large. Use a sample under 25 MB.", 413);
    }
    upstream = await fetch(target, {
      method: request.method,
      headers: {
        ...(request.method === "POST" ? { "content-type": isUpload ? contentType : "application/json" } : {}),
        ...(range ? { range } : {}),
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return refuse(`Could not reach ComfyUI at ${host}:${port}. Is it running?`, 502);
  }

  const type = upstream.headers.get("content-type") ?? "";
  const headers = new Headers({
    "content-type": SAFE_TYPES.test(type) ? type : "application/octet-stream",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { relay as GET, relay as POST };
