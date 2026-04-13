const ROOT = import.meta.dir;
const INDEX = `${ROOT}/golf_dispersion.html`;

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const file = Bun.file(INDEX);
      if (!(await file.exists())) {
        return new Response("golf_dispersion.html not found", { status: 500 });
      }
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Golf shot analyzer → http://localhost:${server.port}/`);
