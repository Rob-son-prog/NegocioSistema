// tools/check-db.js
import Database from 'better-sqlite3';

// abre o mesmo arquivo do seu app
const db = new Database('data.sqlite', { verbose: null });

// helper
const normalize = (v) => (v || '').replace(/\D/g, '');

const cmd = process.argv[2];

if (cmd === 'list') {
  const rows = db.prepare(`
    SELECT id, name, cpf
    FROM customers
    ORDER BY id DESC
    LIMIT 50;
  `).all();

  console.log(rows);   // <-- AQUI, dentro do bloco
  process.exit(0);
}


if (cmd === 'normalize') {
  const rows = db.prepare(`SELECT id, cpf FROM customers WHERE cpf IS NOT NULL;`).all();
  const upd = db.prepare(`UPDATE customers SET cpf = ? WHERE id = ?`);
  const tx = db.transaction((items) => {
    for (const r of items) {
      const n = normalize(r.cpf);
      if (n !== r.cpf) upd.run(n, r.id);
    }
  });
  tx(rows);

  const after = db.prepare(`SELECT id, name, cpf FROM customers ORDER BY id DESC LIMIT 50;`).all();
  console.table(after);
  console.log('✔️ CPFs normalizados (somente números).');
  process.exit(0);
}

console.log(`
Uso:
  node tools/check-db.js list        # lista id, name, cpf
  node tools/check-db.js normalize   # remove . - e espaços dos CPFs
`);
process.exit(0);
