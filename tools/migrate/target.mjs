// Connecting to the emulator or to the live project
//
// Shared by import.mjs and verify.mjs, so the safety checks around the live
// database exist in exactly one place and cannot drift apart.

import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { firebaseConfig } from '../../app-firebase/src/lib/config.js';

export const PROJECT_ID = firebaseConfig.projectId;
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

// A key file anywhere inside the repository is refused outright. .gitignore
// would probably keep it out of a commit, but "probably" is not good enough
// for a credential with full access to the database.
export function assertOutsideRepo(path) {
  const fromRoot = relative(REPO_ROOT, resolve(path));
  if (!fromRoot.startsWith('..') && !isAbsolute(fromRoot)) {
    throw new Error(
      `The key file ${path} is inside the repository. Move it somewhere outside it, such as ` +
        'C:\\Users\\<you>\\secrets\\, and pass that path to --key.'
    );
  }
}

// Opens Firestore for --target emulator or --target live. Returns the
// Admin SDK's Firestore and the two helpers the scripts need from it.
export async function connect({ target, key }) {
  if (target !== 'emulator' && target !== 'live') {
    throw new Error('Choose --target emulator or --target live.');
  }

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');

  let app;
  let description;

  if (target === 'emulator') {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    app = initializeApp({ projectId: PROJECT_ID });
    description = `the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`;
  } else {
    // An emulator setting left over in the shell must never send a live run
    // to the emulator, or a test run to the live project
    delete process.env.FIRESTORE_EMULATOR_HOST;

    const keyPath = key || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) throw new Error('--target live needs --key with the service account key file.');
    assertOutsideRepo(keyPath);

    const credentials = JSON.parse(readFileSync(keyPath, 'utf8'));
    if (credentials.project_id !== PROJECT_ID) {
      throw new Error(`That key belongs to project ${credentials.project_id}, not ${PROJECT_ID}.`);
    }

    app = initializeApp({ credential: cert(credentials), projectId: PROJECT_ID });
    description = `the LIVE project ${PROJECT_ID}`;
  }

  return { db: getFirestore(app), FieldValue, Timestamp, description };
}

// The options both scripts accept
export function parseArgs(argv, known) {
  const args = { commit: false, force: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const name = arg.replace(/^--/, '');

    if (!known.includes(name)) throw new Error(`Unknown option ${arg}`);

    if (name === 'commit' || name === 'force') args[name] = true;
    else args[name] = argv[++i];
  }

  return args;
}
