import type { NextConfig } from 'next';

// EXPORTAR=1 gera a versão estática (pasta out/), com caminhos relativos, para publicar como página.
const exportar = !!process.env.EXPORTAR;

const config: NextConfig = {
  reactStrictMode: true,
  ...(exportar ? { output: 'export', assetPrefix: '.', images: { unoptimized: true } } : {}),
};

export default config;
