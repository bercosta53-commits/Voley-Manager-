-- Vagas: endereço da página de carreiras da conta na Gupy (https://<slug>.gupy.io).
-- Preenchido sozinho quando o conector acha a página; "-" significa "não procurar".
alter table contas add column gupy_slug text;
