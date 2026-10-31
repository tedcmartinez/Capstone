// Clears leftover Firestore emulator processes before a test run.
//
// Why this is needed: the emulator runs as a Java process, and when
// "firebase emulators:exec" finishes it signals that process to stop.
// On Windows the JVM does not always exit, so it keeps holding port 8080
// and the next test run fails with "Could not start Firestore Emulator,
// port taken". This script removes that stale process so the test command
// works every time instead of every other time.
//
// Only processes whose command line mentions the Firestore emulator jar are
// touched, so an unrelated program using the same port is left alone and
// reported instead.

import { execSync } from 'node:child_process';

const PORTS = [8080, 9099, 9150, 4000];
const EMULATOR_MARKER = 'cloud-firestore-emulator';

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function killStaleEmulatorsWindows() {
  // Query the full command line so the emulator can be told apart from any
  // other Java application that happens to be running.
  const csv = run(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'java.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Csv -NoTypeInformation"'
  );

  const killed = [];
  for (const line of csv.split('\n')) {
    if (!line.includes(EMULATOR_MARKER)) continue;
    const pid = line.match(/^"(\d+)"/)?.[1];
    if (!pid) continue;
    run(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`);
    killed.push(pid);
  }
  return killed;
}

function killStaleEmulatorsUnix() {
  const pids = run(`pgrep -f ${EMULATOR_MARKER}`).split('\n').filter(Boolean);
  for (const pid of pids) run(`kill -9 ${pid}`);
  return pids;
}

function portHolders(port) {
  if (process.platform === 'win32') {
    return run(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return run(`lsof -ti tcp:${port}`).split('\n').filter(Boolean);
}

const killed =
  process.platform === 'win32' ? killStaleEmulatorsWindows() : killStaleEmulatorsUnix();

if (killed.length > 0) {
  console.log(`Cleared ${killed.length} stale emulator process(es): ${killed.join(', ')}`);
}

// Anything still holding a port now is not ours, so say so plainly rather
// than letting the Firebase CLI fail with a less helpful message.
for (const port of PORTS) {
  const holders = portHolders(port);
  if (holders.length > 0) {
    console.warn(
      `Warning: port ${port} is still in use by process ${holders.join(', ')}, ` +
        'which is not a Firestore emulator. Stop it before running the tests.'
    );
  }
}
