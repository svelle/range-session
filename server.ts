const ROOT = import.meta.dir;
const INDEX = `${ROOT}/golf_dispersion.html`;

function mimeFor(pathname: string): string {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".csv")) return "text/csv; charset=utf-8";
  return "application/octet-stream";
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === "/" || pathname === "/index.html") {
      const file = Bun.file(INDEX);
      if (!(await file.exists())) {
        return new Response("golf_dispersion.html not found", { status: 500 });
      }
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (pathname.startsWith("/css/") || pathname.startsWith("/js/")) {
      const rel = pathname.replace(/^\//, "");
      const file = Bun.file(`${ROOT}/${rel}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": mimeFor(pathname) },
        });
      }
    }
    if (pathname.startsWith("/data/")) {
      const rel = pathname.replace(/^\//, "");
      const file = Bun.file(`${ROOT}/${rel}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": mimeFor(pathname) },
        });
      }
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Golf shot analyzer → http://localhost:${server.port}/`);
