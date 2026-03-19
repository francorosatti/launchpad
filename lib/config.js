const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

async function load() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function save(data) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { load, save };
