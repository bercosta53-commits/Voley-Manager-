import type { NextConfig } from 'next';

// EXPORTAR=1 gera a versão estática (pasta out/), para publicar como página.
// EXPORTAR_BASE, quando definido, é o caminho onde essa página vai ficar publicada
// (ex.: /artifact/abc123); sem ele, os links internos ficam absolutos a partir da
// raiz do domínio e quebram fora de um deploy na raiz (como uma prévia de artifact).
const exportar = !!process.env.EXPORTAR;
const base = process.env.EXPORTAR_BASE || '';

const config: NextConfig = {
  reactStrictMode: true,
  ...(exportar
    ? { output: 'export', basePath: base, images: { unoptimized: true } }
    : {}),
};

export default config;
