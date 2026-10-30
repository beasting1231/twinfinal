import { existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'tests/fixtures/availability-functions/node_modules');
if (!existsSync(target)) symlinkSync(path.join(root, 'functions/node_modules'), target, 'dir');
const env = { ...process.env };
const javaHome = '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home';
if (!env.JAVA_HOME && existsSync(`${javaHome}/bin/java`)) {
  env.JAVA_HOME = javaHome;
  env.PATH = `${javaHome}/bin:${env.PATH}`;
}
const testing = process.argv[2] === 'test';
const args = [testing ? 'emulators:exec' : 'emulators:start', '--project', 'demo-twin-history',
  '--config', 'firebase.availability-local.json', '--only', 'auth,firestore,functions'];
if (testing) args.push('node --import ./tests/registerAvailabilityTs.mjs --test tests/availabilityHistory.emulator.mjs');
const child = spawn('firebase', args, { cwd: root, env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
