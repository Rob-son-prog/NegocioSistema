// server/tools/check-db.js
import Database from 'better-sqlite3';

// Abre o mesmo banco do app
const db = new Database('data.sqlite', { verbose: null });

// Helper p/ limpar CPF
const normalize = v => (v || '').replace(/\D/g, '');

// Comando (list | normalize)
const cmd = process.argv[2];

// ---------- LIST ----------
if (cmd === 'list') {
  const rows = db.prepare(`
    SELECT id, name, cpf
    FROM customers
    ORDER BY id DESC
    LIMIT 50;
  `).all();

  // Mostra como JSON para ficar legível no PowerShell
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// ---------- NORMALIZE ----------
if (cmd === 'normalize') {
  const rows = db.prepare(`
    SELECT id, cpf
    FROM customers
    WHERE cpf IS NOT NULL;
  `).all();

  const upd = db.prepare(`UPDATE customers SET cpf = ? WHERE id = ?`);
  const tx = db.transaction(items => {
    for (const r of items) {
      const n = normalize(r.cpf);
      if (n !== r.cpf) upd.run(n, r.id);
    }
  });

  tx(rows);

  const after = db.prepare(`
    SELECT id, name, cpf
    FROM customers
    ORDER BY id DESC
    LIMIT 50;
  `).all();

  console.log(JSON.stringify(after, null, 2));
  process.exit(0);
}

// ---------- HELP ----------
console.log('Uso:\n  node server/tools/check-db.js list\n  node server/tools/check-db.js normalize');
process.exit(0);
