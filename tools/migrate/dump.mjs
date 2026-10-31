// Step 1 of the migration: export the LAN version's data
//
// Takes a mysqldump of the three tables that are migrated, and a separate
// list of user names. MySQL must be running, as it is when XAMPP is started.
//
// Usage:
//   npm run migrate:dump
//
// Writes tools/migrate/input/cornerblock_db.sql and users.tsv. Both folders
// are excluded from version control: the dump is the client's real catalog.
//
// The users table is deliberately NOT dumped. It holds email addresses and
// password hashes, and the migration needs neither, because nobody's account
// is migrated: everyone registers again and is approved. The only thing
// needed from it is each user's name, so that old movements can still say
// who logged them, and that alone is exported, through a plain SELECT of the
// id and name columns. No migration file ever contains a hash or an email.
//
// Settings, all optional, read from the environment:
//   MYSQL_BIN       folder holding mysqldump and mysql
//                   (default C:\xampp\mysql\bin on Windows)
//   MYSQL_USER      default root, the XAMPP default
//   MYSQL_PWD       the password, if the account has one; MySQL reads this
//                   variable itself, so it never appears on a command line
//   MYSQL_DATABASE  default cornerblock_db

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { INPUT_DIR } from './convert.mjs';
import { parseDump, parseUserNames } from './sql-dump.mjs';

const BIN = process.env.MYSQL_BIN ?? (process.platform === 'win32' ? 'C:\\xampp\\mysql\\bin' : '');
const USER = process.env.MYSQL_USER || 'root';
const DATABASE = process.env.MYSQL_DATABASE || 'cornerblock_db';

const tool = (name) =>
  BIN ? join(BIN, process.platform === 'win32' ? `${name}.exe` : name) : name;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    console.error('Is XAMPP installed there? Set MYSQL_BIN to the folder holding mysqldump.');
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    if (/2002|2003|Can't connect/.test(result.stderr)) {
      console.error('\nMySQL is not running. Start it from the XAMPP Control Panel and try again.');
    }
    process.exit(1);
  }

  return result.stdout;
}

mkdirSync(INPUT_DIR, { recursive: true });

// ---- The three migrated tables ----
const dumpPath = join(INPUT_DIR, 'cornerblock_db.sql');

run(tool('mysqldump'), [
  `--user=${USER}`,
  // Column names on every INSERT, so the rows can be read without relying on
  // the order of the columns
  '--complete-insert',
  // A consistent snapshot, even if somebody is using the old system while
  // the dump is taken
  '--single-transaction',
  '--no-tablespaces',
  '--default-character-set=utf8mb4',
  '--skip-comments',
  `--result-file=${dumpPath}`,
  DATABASE,
  'suppliers',
  'materials',
  'stock_movements',
]);

// ---- User names only ----
const usersPath = join(INPUT_DIR, 'users.tsv');
const names = run(tool('mysql'), [
  `--user=${USER}`,
  '--batch',
  '--skip-column-names',
  '--default-character-set=utf8mb4',
  `--execute=SELECT user_id, name FROM users ORDER BY user_id`,
  DATABASE,
]);
writeFileSync(usersPath, names);

// ---- What was exported ----
const tables = parseDump(readFileSync(dumpPath, 'utf8'));
const userCount = parseUserNames(names).size;

console.log('Exported to', INPUT_DIR);
console.log('');
console.log(`  cornerblock_db.sql   ${statSync(dumpPath).size.toLocaleString()} bytes`);
console.log(`    suppliers          ${tables.suppliers?.rows.length ?? 0} rows`);
console.log(`    materials          ${tables.materials?.rows.length ?? 0} rows`);
console.log(`    stock_movements    ${tables.stock_movements?.rows.length ?? 0} rows`);
console.log(`  users.tsv            ${userCount} names (no emails or passwords)`);
console.log('');
console.log('Next: npm run migrate:convert');
