const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const apiDir = path.join(__dirname, 'app', 'api');

walkDir(apiDir, (filePath) => {
  if (filePath.endsWith('route.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('import { guard }')) {
      const injectString = `import { guard } from '@/lib/sahamLensGuard';\nguard();\n\n`;
      content = injectString + content;
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Injected into ' + filePath);
    }
  }
});
