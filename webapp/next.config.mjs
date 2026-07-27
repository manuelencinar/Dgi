/** @type {import('next').NextConfig} */
const nextConfig = {
  // Puppeteer + Chromium (infografía PDF) no deben empaquetarse: se cargan como
  // dependencias nativas del runtime Node en el servidor (evita romper el binario).
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
};

export default nextConfig;
