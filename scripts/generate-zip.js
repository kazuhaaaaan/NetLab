import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function generateFoundationZip() {
  const zip = new JSZip();
  const rootDir = process.cwd();

  const includeDirs = ['packages', 'docs', 'examples', 'templates', 'tests', 'scripts', '.github', '.vscode'];
  const includeFiles = [
    'README.md',
    'ARCHITECTURE.md',
    'DEVELOPMENT.md',
    'CODING_STANDARDS.md',
    'ROADMAP.md',
    'PROMPT.md',
    'CONTRACT.md',
    'package.json',
    'pnpm-workspace.yaml',
    'turbo.json',
    'metadata.json'
  ];

  function addDirectoryToZip(dirPath, zipFolderPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativeZipPath = path.join(zipFolderPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
        addDirectoryToZip(fullPath, relativeZipPath);
      } else {
        const fileContent = fs.readFileSync(fullPath);
        zip.file(relativeZipPath, fileContent);
      }
    }
  }

  // Add individual root files
  for (const file of includeFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      zip.file(file, fs.readFileSync(filePath));
    }
  }

  // Add directories
  for (const dir of includeDirs) {
    const dirPath = path.join(rootDir, dir);
    if (fs.existsSync(dirPath)) {
      addDirectoryToZip(dirPath, dir);
    }
  }

  const publicDir = path.join(rootDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outputPath = path.join(publicDir, 'NetLab-Foundation-v1.zip');
  fs.writeFileSync(outputPath, content);

  console.log(`Successfully generated ${outputPath} (${(content.length / 1024).toFixed(2)} KB)`);
}

generateFoundationZip().catch(console.error);
