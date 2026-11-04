const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const screenshotDirectory = 'images/terraform-plan-viewer/';

function imageUrl(manifest, filename) {
  return `https://${manifest.publisher.toLowerCase()}.gallery.vsassets.io/_apis/public/gallery/publisher/${manifest.publisher}/extension/${manifest.id}/${manifest.version}/assetbyname/${filename}`;
}

function prepareReadme(manifest, output) {
  const sourcePath = manifest.content.details.path;
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  let count = 0;
  const readme = source.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (match, before, reference, after) => {
    const filename = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), reference));
    if (!filename.startsWith(screenshotDirectory)) return match;
    assert(fs.existsSync(path.join(root, filename)), `Missing README image: ${filename}`);
    count++;
    return before + imageUrl(manifest, filename) + after;
  });
  assert.equal(count, 5, 'The Marketplace README must include all five screenshots.');
  const directory = path.join(output, manifest.id);
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'readme.md');
  fs.writeFileSync(filename, readme);
  const prepared = structuredClone(manifest);
  prepared.content.details.path = path.relative(root, filename).split(path.sep).join('/');
  for (const file of prepared.files) file.path = path.resolve(root, file.path);
  for (const key of Object.keys(prepared.icons)) prepared.icons[key] = path.relative(directory, path.resolve(root, prepared.icons[key]));
  const preparedManifest = path.join(directory, 'manifest.json');
  fs.writeFileSync(preparedManifest, JSON.stringify(prepared));
  return ['--manifests', preparedManifest];
}

async function verifyReadme(archive, manifest) {
  const metadata = await archive.file('extension.vsixmanifest').async('string');
  const details = [...metadata.matchAll(/<Asset\b[^>]*>/g)]
    .map(([tag]) => tag).find(tag => tag.includes('Type="Microsoft.VisualStudio.Services.Content.Details"'));
  assert(details, 'The VSIX must include a Marketplace README.');
  const readmePath = details.match(/\bPath="([^"]+)"/)[1];
  const readme = await archive.file(readmePath).async('string');
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  assert.equal(images.length, 5);
  for (const [, url] of images) {
    const filename = new URL(url).pathname.split('/assetbyname/')[1];
    assert(filename?.startsWith(screenshotDirectory), 'README images must use the packaged Gallery assets.');
    assert.equal(url, imageUrl(manifest, filename), 'README images must target this extension identity and version.');
    assert([...metadata.matchAll(/<Asset\b[^>]*>/g)].some(([tag]) => tag.includes(`Type="${filename}"`) && tag.includes('Addressable="true"')),
    'README images must be addressable.');
    const bytes = await archive.file(filename).async('nodebuffer');
    assert(bytes.equals(fs.readFileSync(path.join(root, filename))), 'Packaged images must match the captured screenshots.');
    assert.equal(bytes.readUInt32BE(16), 600);
    assert.equal(bytes.readUInt32BE(20), filename.endsWith('/status.png') ? 300 : 400);
  }
  console.log(`Verified ${manifest.id} README and five Gallery image URLs.`);
}

module.exports = { prepareReadme, verifyReadme };
