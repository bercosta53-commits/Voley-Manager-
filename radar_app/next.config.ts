import type { NextConfig } from 'next';

// EXPORTAR=1 gera a versão estática (pasta out/), com caminhos relativos, para publicar como página.
// Caminhos relativos (em vez de basePath) são o que funciona numa prévia publicada em claude.ai: o
// endereço real do arquivo lá não segue um padrão previsível, então um basePath fixo quebra o CSS e os
// scripts (o navegador tenta buscá-los num endereço que não existe). Relativo, o navegador resolve a
// partir de onde a página realmente está, sempre certo no carregamento inicial de cada tela.
const exportar = !!process.env.EXPORTAR;

const config: NextConfig = {
  reactStrictMode: true,
  ...(exportar ? { output: 'export', assetPrefix: '.', images: { unoptimized: true } } : {}),
};

export default config;
