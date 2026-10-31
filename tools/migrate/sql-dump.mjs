// Reading a mysqldump file
//
// Turns the dump of the LAN version's database into plain rows, without
// needing MySQL running and without loading the dump into anything. Only
// the parts of SQL a mysqldump actually writes are understood: CREATE TABLE,
// for each table's column order, and INSERT, for its rows. Everything else
// in the file, the SET and LOCK statements and the comments, is skipped.
//
// The INSERT values are read with a small state machine rather than a
// regular expression. A regular expression would break on the first note
// containing a comma, a bracket or an escaped quote, and the catalog's
// notes are free text typed by people.

// ============================================================
// THE PUBLIC FUNCTION
// ============================================================

// Returns { tableName: { columns: [...], rows: [{ column: value }] } }.
// Values come back as JavaScript null, numbers, or strings, with dates left
// as the 'YYYY-MM-DD' strings MySQL wrote.
export function parseDump(sql) {
  const tables = {};

  // CREATE TABLE gives the column order, which is needed when an INSERT was
  // written without its column list (a dump taken without --complete-insert)
  for (const { name, columns } of readCreateTables(sql)) {
    tables[name] = { columns, rows: [] };
  }

  for (const { name, columns, tuples } of readInserts(sql)) {
    const table = tables[name] || (tables[name] = { columns: columns || [], rows: [] });
    const columnNames = columns || table.columns;

    if (columnNames.length === 0) {
      throw new Error(
        `The rows for table ${name} come with no column names, and the dump has no ` +
          'CREATE TABLE for it. Take the dump again with --complete-insert.'
      );
    }

    for (const values of tuples) {
      if (values.length !== columnNames.length) {
        throw new Error(
          `A row in ${name} has ${values.length} values but the table has ` +
            `${columnNames.length} columns.`
        );
      }
      const row = {};
      columnNames.forEach((column, index) => {
        row[column] = values[index];
      });
      table.rows.push(row);
    }
  }

  return tables;
}

// ============================================================
// CREATE TABLE
// ============================================================

function* readCreateTables(sql) {
  const pattern = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)[^;]*;/g;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const columns = [];

    // A column definition starts with its backquoted name. Lines starting
    // with PRIMARY KEY, KEY, UNIQUE or CONSTRAINT are not columns.
    for (const line of match[2].split('\n')) {
      const column = line.trim().match(/^`([^`]+)`\s/);
      if (column) columns.push(column[1]);
    }

    yield { name: match[1], columns };
  }
}

// ============================================================
// INSERT
// ============================================================

function* readInserts(sql) {
  const head = /INSERT INTO `([^`]+)`\s*(\(([^)]*)\))?\s*VALUES\s*/g;
  let match;

  while ((match = head.exec(sql)) !== null) {
    const columns = match[3]
      ? match[3].split(',').map((c) => c.trim().replace(/^`|`$/g, ''))
      : null;

    const { tuples, end } = readTuples(sql, head.lastIndex);
    head.lastIndex = end;

    yield { name: match[1], columns, tuples };
  }
}

// Reads ( ... ), ( ... ), ... ; starting at position, and returns the parsed
// rows and where the statement ended.
function readTuples(sql, position) {
  const tuples = [];
  let i = position;

  while (i < sql.length) {
    i = skipSpace(sql, i);
    const char = sql[i];

    if (char === ';') return { tuples, end: i + 1 };
    if (char === ',') {
      i += 1;
      continue;
    }
    if (char !== '(') {
      throw new Error(`Unexpected "${char}" in an INSERT at position ${i}.`);
    }

    const { values, end } = readTuple(sql, i + 1);
    tuples.push(values);
    i = end;
  }

  throw new Error('An INSERT statement in the dump is not closed with a semicolon.');
}

function readTuple(sql, position) {
  const values = [];
  let i = position;

  while (i < sql.length) {
    i = skipSpace(sql, i);

    const { value, end } = readValue(sql, i);
    values.push(value);
    i = skipSpace(sql, end);

    if (sql[i] === ',') {
      i += 1;
      continue;
    }
    if (sql[i] === ')') return { values, end: i + 1 };

    throw new Error(`Expected a comma or a closing bracket at position ${i}.`);
  }

  throw new Error('A row in the dump is not closed.');
}

function readValue(sql, i) {
  if (sql[i] === "'") return readString(sql, i + 1);

  if (sql.startsWith('NULL', i)) return { value: null, end: i + 4 };

  // A number: an integer, a decimal such as 350.00, or one with an exponent
  const number = sql.slice(i).match(/^-?\d+(\.\d+)?([eE][-+]?\d+)?/);
  if (number) return { value: Number(number[0]), end: i + number[0].length };

  throw new Error(`Could not read the value at position ${i}: ${sql.slice(i, i + 20)}`);
}

// MySQL escapes inside a quoted string. A doubled quote '' is also a quote.
const ESCAPES = {
  0: '\0',
  "'": "'",
  '"': '"',
  b: '\b',
  n: '\n',
  r: '\r',
  t: '\t',
  Z: '\x1a',
  '\\': '\\',
  // These two keep their backslash outside a LIKE pattern
  '%': '\\%',
  _: '\\_',
};

function readString(sql, position) {
  let text = '';
  let i = position;

  while (i < sql.length) {
    const char = sql[i];

    if (char === '\\') {
      const next = sql[i + 1];
      text += Object.prototype.hasOwnProperty.call(ESCAPES, next) ? ESCAPES[next] : next;
      i += 2;
      continue;
    }

    if (char === "'") {
      if (sql[i + 1] === "'") {
        text += "'";
        i += 2;
        continue;
      }
      return { value: text, end: i + 1 };
    }

    text += char;
    i += 1;
  }

  throw new Error('A quoted value in the dump is never closed.');
}

function skipSpace(sql, i) {
  while (i < sql.length && /\s/.test(sql[i])) i += 1;
  return i;
}

// ============================================================
// THE USER NAMES FILE
//
// Produced by `mysql --batch`, one "id<TAB>name" line per user. Only the id
// and the name are exported, so no email address or password hash ever
// enters the migration. --batch writes a tab, newline or backslash inside a
// value as \t, \n or \\, which is undone here.
// ============================================================

export function parseUserNames(tsv) {
  const names = new Map();

  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const tab = line.indexOf('\t');
    if (tab === -1) continue;

    const id = Number(line.slice(0, tab));
    if (!Number.isInteger(id)) continue;

    const name = line
      .slice(tab + 1)
      .replace(/\\(.)/g, (_, c) => ({ t: '\t', n: '\n', '\\': '\\', 0: '\0' })[c] ?? c);

    names.set(id, name);
  }

  return names;
}
