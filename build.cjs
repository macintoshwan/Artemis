/**
 * main 分支构建脚本
 * 把纯静态文件复制到 dist/，供 Cloudflare Pages 部署
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'dist');

// 清空并重建 dist
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// 复制单文件
const files = ['index.html', 'app.js', 'styles.css'];
for (const f of files) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(OUT, f));
    console.log(`  copied ${f}`);
  }
}

// 复制 fonts 目录
if (fs.existsSync('fonts')) {
  fs.cpSync('fonts', path.join(OUT, 'fonts'), { recursive: true });
  console.log('  copied fonts/');
}

// 复制 docs 目录（如果存在）
if (fs.existsSync('docs')) {
  fs.cpSync('docs', path.join(OUT, 'docs'), { recursive: true });
  console.log('  copied docs/');
}

console.log('✓ Static build complete → dist/');
