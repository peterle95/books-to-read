const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

const web = join(__dirname, '..', 'web');
const read = (file) => readFileSync(join(web, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

for (const file of ['index.html', 'style.css', 'app.js', 'sw.js', ...manifest.icons.map((icon) => icon.src)]) {
  if (!readFileSync(join(web, file)).length) throw new Error(`Empty site file: ${file}`);
}

const scripts = readdirSync(web, { recursive: true }).filter((file) => file.endsWith('.js'));
for (const file of scripts) new Script(read(file), { filename: join(web, file) });
console.log(`Checked ${scripts.length} browser scripts and required site files.`);
