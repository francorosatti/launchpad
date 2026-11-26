const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_REPOS_DIR = path.join(os.homedir(), 'Documents', 'github');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveReposDir(cfg) {
  return path.resolve(expandHome(cfg?.reposDir) || DEFAULT_REPOS_DIR);
}

async function isExecutable(p) {
  try {
    await fs.access(p, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findInPath(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, bin);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

// The systemd service runs with a minimal PATH, so also look in the usual install locations.
async function findClaude() {
  const fromPath = await findInPath('claude');
  if (fromPath) return fromPath;
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const c of candidates) {
    if (await isExecutable(c)) return c;
  }
  return null;
}

async function checkLocalRepos(reposDir, repos) {
  const missing = [];
  for (const repo of repos) {
    try {
      const stat = await fs.stat(path.join(reposDir, repo));
      if (!stat.isDirectory()) missing.push(repo);
    } catch {
      missing.push(repo);
    }
  }
  return missing;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function findTerminal() {
  if (process.platform === 'darwin') return { kind: 'mac' };
  const terminator = await findInPath('terminator') || (await isExecutable('/usr/bin/terminator') ? '/usr/bin/terminator' : null);
  if (terminator) return { kind: 'terminator', bin: terminator };
  const gnome = await findInPath('gnome-terminal') || (await isExecutable('/usr/bin/gnome-terminal') ? '/usr/bin/gnome-terminal' : null);
  if (gnome) return { kind: 'gnome', bin: gnome };
  const generic = await findInPath('x-terminal-emulator') || (await isExecutable('/usr/bin/x-terminal-emulator') ? '/usr/bin/x-terminal-emulator' : null);
  if (generic) return { kind: 'generic', bin: generic };
  return null;
}

/**
 * Opens a new terminal window in `reposDir` running an interactive Claude Code session
 * seeded with `prompt`. The terminal stays open after Claude exits.
 * Returns { command } – the shell command, so the UI can offer it for manual use.
 */
async function launchClaudeSession({ reposDir, prompt }) {
  const claude = await findClaude();
  if (!claude) throw new Error('Could not find the `claude` CLI. Install Claude Code or add it to PATH.');

  const stat = await fs.stat(reposDir).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`Repositories folder not found: ${reposDir}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launchpad-'));
  const promptFile = path.join(workDir, 'prompt.md');
  const scriptFile = path.join(workDir, 'run.sh');
  await fs.writeFile(promptFile, prompt, 'utf8');
  await fs.writeFile(scriptFile, [
    '#!/usr/bin/env bash',
    `cd ${shellQuote(reposDir)} || exit 1`,
    `${shellQuote(claude)} "$(cat ${shellQuote(promptFile)})"`,
    'echo',
    'echo "Claude session ended. Press Enter to close."',
    'read -r',
    '',
  ].join('\n'), { mode: 0o700 });

  const command = `cd ${shellQuote(reposDir)} && ${shellQuote(claude)} "$(cat ${shellQuote(promptFile)})"`;

  const terminal = await findTerminal();
  if (!terminal) {
    const err = new Error('No supported terminal emulator found.');
    err.command = command;
    throw err;
  }

  let bin;
  let args;
  if (terminal.kind === 'terminator') {
    bin = terminal.bin;
    args = ['--title=Launchpad: fix vulnerabilities', `--working-directory=${reposDir}`, '-x', 'bash', scriptFile];
  } else if (terminal.kind === 'gnome') {
    bin = terminal.bin;
    args = ['--title=Launchpad: fix vulnerabilities', `--working-directory=${reposDir}`, '--', 'bash', scriptFile];
  } else if (terminal.kind === 'generic') {
    bin = terminal.bin;
    args = ['-e', 'bash', scriptFile];
  } else {
    bin = 'osascript';
    args = ['-e', `tell application "Terminal" to do script "bash ${scriptFile.replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate'];
  }

  await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: reposDir, detached: true, stdio: 'ignore', env: process.env });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });

  return { command };
}

module.exports = { resolveReposDir, checkLocalRepos, launchClaudeSession, DEFAULT_REPOS_DIR };
