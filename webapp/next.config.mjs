/** @type {import('next').NextConfig} */
const nextConfig = {
  // Puppeteer + Chromium (infografía PDF) no deben empaquetarse: se cargan como
  // dependencias nativas del runtime Node en el servidor (evita romper el binario).
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  // El tracing de ficheros de Vercel no detecta las lecturas dinámicas de los packs de
  // @sparticuz/chromium (bin/*.br: binario + librerías compartidas como libnss3). Sin
  // ellos Chromium arranca pero falla al cargar libnss3.so. Los incluimos explícitamente.
  outputFileTracingIncludes: {
    '/api/infografia/**': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
