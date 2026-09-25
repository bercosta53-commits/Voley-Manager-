// Registro dos perfis de cliente disponíveis no painel.
import velora from './velora.mjs';
import modelo from './modelo.mjs';

export const profiles = [velora, modelo];
export const profileById = id => profiles.find(p => p.id === id) || null;
