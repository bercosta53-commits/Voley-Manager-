-- Vagas em várias plataformas: a conta guarda o endereço da página de carreiras (Gupy, Greenhouse, Lever,
-- Ashby ou Sólides). "-" significa "não procurar". O gupy_slug da migração 004 é convertido.
alter table contas add column vagas_url text;
update contas set vagas_url = 'https://' || gupy_slug || '.gupy.io/' where gupy_slug is not null and gupy_slug != '-';
update contas set vagas_url = '-' where gupy_slug = '-';
