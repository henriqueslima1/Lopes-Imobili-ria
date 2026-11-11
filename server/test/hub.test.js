// Hub: administrador criado sozinho, login por usuário, colaboradores (cadastro, acesso, vendas) e troca de senha.
// Só roda com TESTE_DATABASE_URL (um banco vazio só para teste: as tabelas são limpas). Nunca usa a DATABASE_URL.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TESTE_DATABASE_URL || '';
process.env.ADMIN_USUARIO = 'Lopes';
process.env.ADMIN_SENHA = 'senha-de-teste';
const { migrar, pool, q } = await import('../db.js');
const auth = await import('../auth.js');
const { acoes } = await import('../rotas/hub.js');
const crm = await import('../rotas/crm.js');

const semBanco = !process.env.TESTE_DATABASE_URL;
after(() => pool && pool.end());
before(async () => {
  if (semBanco) return;
  await migrar();
  await q('TRUNCATE leads, usuarios, sessoes RESTART IDENTITY CASCADE');
});

test('administrador: criado na primeira vez, entra com o usuário (sem diferenciar maiúscula)', { skip: semBanco }, async () => {
  await auth.prepararAdmin();
  await auth.prepararAdmin(); // de novo: não cria outro
  assert.equal((await q("SELECT count(*)::int AS n FROM usuarios WHERE papel = 'admin'")).rows[0].n, 1);
  assert.equal((await auth.conferirLogin('Lopes', 'senha-de-teste')).papel, 'admin');
  assert.equal((await auth.conferirLogin('lopes', 'senha-de-teste')).papel, 'admin');
  assert.equal(await auth.conferirLogin('Lopes', 'senha-errada'), null);
  assert.equal(await auth.conferirLogin('ninguem', 'senha-de-teste'), null);
  assert.equal(await auth.conferirLogin('', ''), null);
});

test('colaboradores: cadastrar com e sem acesso, regras de nome, usuário e senha', { skip: semBanco }, async () => {
  await assert.rejects(acoes.colaborador_salvar({ corpo: {} }), /nome/);
  const sem = await acoes.colaborador_salvar({ corpo: { nome: 'Rafael Costa', cargo: 'Corretor', creci: '12345-F' } });
  await assert.rejects(acoes.colaborador_salvar({ corpo: { nome: 'rafael costa' } }), /mesmo nome|com esse nome/);
  await assert.rejects(acoes.colaborador_salvar({ corpo: { nome: 'Ana Paula', acesso: true, usuario: 'ana paula', senha: 'abcdef' } }), /usuário precisa/);
  await assert.rejects(acoes.colaborador_salvar({ corpo: { nome: 'Ana Paula', acesso: true, usuario: 'ana' } }), /Crie uma senha/);
  await assert.rejects(acoes.colaborador_salvar({ corpo: { nome: 'Ana Paula', acesso: true, usuario: 'ana', senha: '123' } }), /6 caracteres/);
  await assert.rejects(acoes.colaborador_salvar({ corpo: { nome: 'Ana Paula', acesso: true, usuario: 'lopes', senha: 'abcdef' } }), /já está em uso/);
  const ana = await acoes.colaborador_salvar({ corpo: { nome: 'Ana Paula', cargo: 'Corretor', acesso: true, usuario: 'Ana', senha: 'senha-da-ana' } });

  assert.equal(await auth.conferirLogin('Rafael Costa', ''), null); // sem acesso não entra
  const entrou = await auth.conferirLogin('ana', 'senha-da-ana');
  assert.equal(entrou.papel, 'colaborador');
  assert.equal(entrou.usuario, 'ana'); // o usuário fica em minúsculas

  const { colaboradores } = await acoes.colaboradores({ corpo: {} });
  assert.deepEqual(colaboradores.map(c => [c.nome, c.acesso, c.usuario]), [['Ana Paula', true, 'ana'], ['Rafael Costa', false, '']]);
  assert.equal(JSON.stringify(colaboradores).includes('scrypt'), false); // a senha nunca vai para a tela
  assert.ok(sem.id && ana.id);
});

test('vendas por corretor: no período, renomear leva os leads junto, sem responsável à parte', { skip: semBanco }, async () => {
  const eu = { nome: 'Lopes', papel: 'admin' };
  const venda = async (nome, resp, valor) => {
    const { id } = await crm.acoes.lead_salvar({ corpo: { nome }, eu });
    if (resp) await crm.acoes.lead_campo({ corpo: { id, campo: 'responsavel', valor: resp }, eu });
    await crm.acoes.lead_campo({ corpo: { id, campo: 'valor', valor }, eu });
    await crm.acoes.etapa({ corpo: { id, etapa: 'venda' }, eu });
    return id;
  };
  await venda('Cliente 1', 'Ana Paula', '400.000');
  await venda('Cliente 2', 'Ana Paula', '250.000');
  await venda('Cliente 3', '', '100.000');
  const andando = await crm.acoes.lead_salvar({ corpo: { nome: 'Cliente 4' }, eu });
  await crm.acoes.lead_campo({ corpo: { id: andando.id, campo: 'responsavel', valor: 'Rafael Costa' }, eu });
  await crm.acoes.etapa({ corpo: { id: andando.id, etapa: 'visita_agendada' }, eu });
  // venda antiga (fora do mês)
  const velha = await venda('Cliente 5', 'Rafael Costa', '300.000');
  await q("UPDATE leads SET vendido_em = now() - interval '200 days' WHERE id = $1", [velha]);

  let r = await acoes.colaboradores({ corpo: { periodo: 'mes' } });
  const ana = r.colaboradores.find(c => c.nome === 'Ana Paula'), rafa = r.colaboradores.find(c => c.nome === 'Rafael Costa');
  assert.deepEqual([ana.vendas, ana.vendido], [2, 650000]);
  assert.deepEqual([rafa.vendas, rafa.vendido, rafa.andamento, rafa.visitas], [0, 0, 1, 1]);
  assert.deepEqual(r.resumo.sem_responsavel, { vendas: 1, vendido: 100000 });
  assert.equal(r.resumo.vendido, 750000);
  r = await acoes.colaboradores({ corpo: { periodo: 'tudo' } });
  assert.equal(r.colaboradores.find(c => c.nome === 'Rafael Costa').vendido, 300000);

  // renomear: os leads acompanham e a ficha mostra as vendas
  await acoes.colaborador_salvar({ corpo: { id: ana.id, nome: 'Ana Paula Souza', cargo: 'Gerente', acesso: true, usuario: 'ana' } });
  const ficha = await acoes.colaborador({ corpo: { id: ana.id } });
  assert.equal(ficha.colaborador.cargo, 'Gerente');
  assert.equal(ficha.vendas.length, 2);
  assert.equal((await q("SELECT count(*)::int AS n FROM leads WHERE responsavel = 'Ana Paula Souza'")).rows[0].n, 2);
  assert.ok(await auth.conferirLogin('ana', 'senha-da-ana')); // editar sem senha mantém a senha

  // no CRM, só os colaboradores ativos aparecem em Responsável
  await acoes.colaborador_salvar({ corpo: { id: rafa.id, nome: 'Rafael Costa', ativo: false } });
  assert.deepEqual((await crm.acoes.dados({ eu })).ajustes.responsaveis, ['Ana Paula Souza']);
});

test('acesso: tirar o acesso derruba a sessão; trocar a própria senha pede a atual', { skip: semBanco }, async () => {
  const ana = (await q("SELECT id FROM usuarios WHERE usuario = 'ana'")).rows[0];
  // sessão aberta como se fosse pelo navegador
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  await auth.abrirSessao({ headers: {} }, res, ana.id);
  const token = /lopes_sessao=([0-9a-f]{64})/.exec(res.headers['Set-Cookie'])[1];
  const req = { headers: { cookie: 'lopes_sessao=' + token } };
  assert.equal((await auth.quemEsta(req)).nome, 'Ana Paula Souza');

  await assert.rejects(acoes.senha_trocar({ corpo: { atual: 'errada', nova: 'nova-senha' }, eu: { id: ana.id }, req }), /não confere/);
  await assert.rejects(acoes.senha_trocar({ corpo: { atual: 'senha-da-ana', nova: '123' }, eu: { id: ana.id }, req }), /6 caracteres/);
  await acoes.senha_trocar({ corpo: { atual: 'senha-da-ana', nova: 'nova-senha' }, eu: { id: ana.id }, req });
  assert.ok(await auth.conferirLogin('ana', 'nova-senha'));
  assert.ok(await auth.quemEsta(req)); // continua logada neste aparelho

  await acoes.colaborador_salvar({ corpo: { id: ana.id, nome: 'Ana Paula Souza', acesso: false } });
  assert.equal(await auth.quemEsta(req), null);
  assert.equal(await auth.conferirLogin('ana', 'nova-senha'), null);

  await acoes.colaborador_excluir({ corpo: { id: ana.id } });
  assert.equal((await q("SELECT count(*)::int AS n FROM leads WHERE responsavel = 'Ana Paula Souza'")).rows[0].n, 2); // os leads ficam
});
