const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://raw.githubusercontent.com/mozilla/readability/main/Readability.js';
const outputPath = path.resolve(__dirname, '..', 'src', 'Readability.js');

https
  .get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to fetch Readability.js: HTTP ${res.statusCode}`);
      res.resume();
      process.exit(1);
    }

    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const banner = '// Source: https://github.com/mozilla/readability\n';
      fs.writeFileSync(outputPath, `${banner}${body}`, 'utf8');
      console.log(`Saved ${outputPath}`);
    });
  })
  .on('error', (err) => {
    console.error(`Download error: ${err.message}`);
    process.exit(1);
  });
