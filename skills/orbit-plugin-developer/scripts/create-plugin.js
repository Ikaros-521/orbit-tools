#!/usr/bin/env node
/* Orbit Toolbox 插件脚手架生成工具 */
const fs = require('fs');
const path = require('path');

const ID_RE = /^[a-z][a-z0-9-]*$/;

function parseArgs() {
  const args = process.argv.slice(2);
  let id = null;
  let template = 'frontend';
  let output = null;

  for (const a of args) {
    if (a.startsWith('--template=')) {
      template = a.split('=')[1];
    } else if (a.startsWith('--output=')) {
      output = a.split('=')[1];
    } else if (!a.startsWith('-') && !id) {
      id = a;
    }
  }

  return { id, template, output };
}

function copyDir(src, dest, transformJson) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);

    if (ent.isDirectory()) {
      copyDir(srcPath, destPath, transformJson);
    } else if (ent.name === 'plugin.json' && transformJson) {
      const raw = fs.readFileSync(srcPath, 'utf8');
      const obj = JSON.parse(raw);
      transformJson(obj);
      fs.writeFileSync(destPath, JSON.stringify(obj, null, 2), 'utf8');
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const { id, template, output } = parseArgs();

  if (!id) {
    console.log(`用法: node create-plugin.js <plugin-id> [--template=frontend|fullstack|window] [--output=目标目录]`);
    console.log(`示例: node create-plugin.js my-calculator --template=frontend`);
    process.exit(1);
  }

  if (!ID_RE.test(id)) {
    console.error(`错误: 插件 id "${id}" 不符合规范，必须小写英文字母开头，仅包含小写字母、数字和连字符 (例如: my-tool-1)。`);
    process.exit(1);
  }

  const tplMap = {
    frontend: 'frontend-only',
    fullstack: 'fullstack',
    window: 'standalone-window',
  };

  const tplDirName = tplMap[template] || 'frontend-only';
  const tplDir = path.join(__dirname, '..', 'templates', tplDirName);

  if (!fs.existsSync(tplDir)) {
    console.error(`错误: 找不到模板目录: ${tplDir}`);
    process.exit(1);
  }

  const targetRoot = output ? path.resolve(output) : process.cwd();
  const destDir = path.join(targetRoot, id);

  if (fs.existsSync(destDir)) {
    console.error(`错误: 目标目录已存在: ${destDir}`);
    process.exit(1);
  }

  copyDir(tplDir, destDir, manifest => {
    manifest.id = id;
    manifest.name = { zh: id, en: id };
  });

  console.log(`\n🎉 插件脚手架生成成功！`);
  console.log(`📁 目录路径: ${destDir}`);
  console.log(`📦 模板类型: ${tplDirName}`);
  console.log(`\n使用说明:`);
  console.log(`1. 将该目录复制到 Orbit Toolbox 的「用户插件目录」中；`);
  console.log(`2. 打开 Orbit Toolbox，进入「插件中心」点击「重新扫描插件」即可使用！\n`);
}

main();
