// Test suite for AI Chat attachment context & display isolation
const assert = require('assert');
const {
  formatAttachmentContext,
  assembleUserMessageContent,
  cloneForInference,
  buildBoundedContext
} = require('../src/plugins/ai-chat/lib/context-bounds');

console.log('--- Testing Attachment Context Assembly & Surface Isolation ---');

// 1. Single file context formatting
const sampleFile = {
  type: 'file',
  name: 'calc.js',
  path: '/workspace/src/calc.js',
  content: 'function add(a, b) { return a + b; }'
};
const formattedFile = formatAttachmentContext(sampleFile);
assert.ok(formattedFile.includes('### 附件文件: calc.js'));
assert.ok(formattedFile.includes('function add(a, b)'));
console.log('✓ formatAttachmentContext for file passed');

// 2. Directory context formatting
const sampleDir = {
  type: 'directory',
  name: 'my-project',
  path: '/workspace/my-project',
  isDirectory: true
};
const formattedDir = formatAttachmentContext(sampleDir);
assert.ok(formattedDir.includes('### 附件文件夹目录: /workspace/my-project'));
assert.ok(formattedDir.includes('(已关联本地目录供分析与定位)'));
console.log('✓ formatAttachmentContext for directory passed');

// 3. assembleUserMessageContent with user instruction and attachments
const assembled = assembleUserMessageContent('请审查这段代码的健壮性', [sampleFile, sampleDir]);
assert.ok(assembled.includes('[用户随附文件/目录上下文]:'));
assert.ok(assembled.includes('### 附件文件: calc.js'));
assert.ok(assembled.includes('### 附件文件夹目录: /workspace/my-project'));
assert.ok(assembled.includes('[用户指令]:\n请审查这段代码的健壮性'));
console.log('✓ assembleUserMessageContent with text & attachments passed');

// 4. assembleUserMessageContent with empty user instruction
const assembledEmpty = assembleUserMessageContent('', [sampleFile]);
assert.ok(assembledEmpty.includes('[用户指令]:\n请基于上述随附文件/目录进行分析。'));
console.log('✓ assembleUserMessageContent with empty text fallback passed');

// 5. Idempotency test (legacy messages containing context header)
const legacyText = '[用户随附文件/目录上下文]:\n### 附件文件: a.js\n```\nfoo\n```\n\n[用户指令]:\n老指令';
const assembledLegacy = assembleUserMessageContent(legacyText, [sampleFile]);
assert.strictEqual(assembledLegacy, legacyText);
console.log('✓ assembleUserMessageContent idempotency on legacy text passed');

// 6. cloneForInference surface isolation test
const userMsgInDb = {
  id: 'msg_1',
  role: 'user',
  content: '优化性能',
  attachments: [sampleFile]
};
const modelView = cloneForInference(userMsgInDb);
assert.strictEqual(userMsgInDb.content, '优化性能', 'Stored user message content must remain pure and untainted');
assert.ok(modelView.content.includes('[用户随附文件/目录上下文]:'), 'Model view must contain assembled context');
assert.ok(modelView.content.includes('function add(a, b)'));
assert.ok(modelView.content.includes('[用户指令]:\n优化性能'));
console.log('✓ Display vs Model Surface Isolation verified');

// 7. buildBoundedContext with attachments
const bounded = buildBoundedContext([userMsgInDb], 10);
assert.strictEqual(bounded.length, 1);
assert.ok(bounded[0].content.includes('function add(a, b)'));
console.log('✓ buildBoundedContext with attachments verified');

// 8. Test parseDisplayMessage logic (identical to panel.js implementation)
function parseDisplayMessage(msg) {
  if (!msg) return { text: '', legacyAttachments: [], isLegacyAssembled: false };
  const raw = String(msg.content || '');
  const CONTEXT_START = '[用户随附文件/目录上下文]:';
  const INSTRUCTION_START = '[用户指令]:';

  if (raw.includes(CONTEXT_START) && raw.includes(INSTRUCTION_START)) {
    const parts = raw.split(INSTRUCTION_START);
    const contextSection = parts[0].replace(CONTEXT_START, '').trim();
    const instructionText = (parts[1] || '').trim();

    const legacyAttachments = [];
    if (!Array.isArray(msg.attachments) || msg.attachments.length === 0) {
      const fileBlocks = contextSection.split(/(?=### 附件(?:文件|文件夹目录):)/g);
      fileBlocks.forEach((fb, idx) => {
        const trimmed = fb.trim();
        if (!trimmed) return;
        const fileMatch = trimmed.match(/^### 附件文件:\s*(.+)$/m);
        const dirMatch = trimmed.match(/^### 附件文件夹目录:\s*(.+)$/m);
        if (fileMatch) {
          const name = fileMatch[1].trim();
          const codeMatch = trimmed.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
          legacyAttachments.push({
            type: 'file',
            id: `legacy_file_${idx}`,
            name: name.split(/[\\/]/).pop() || name,
            path: name,
            content: codeMatch ? codeMatch[1] : trimmed,
            size: codeMatch ? Buffer.byteLength(codeMatch[1], 'utf8') : 0
          });
        } else if (dirMatch) {
          const dirPath = dirMatch[1].trim();
          legacyAttachments.push({
            type: 'directory',
            id: `legacy_dir_${idx}`,
            name: dirPath.split(/[\\/]/).pop() || dirPath,
            path: dirPath
          });
        }
      });
    }

    const isDefaultInstruction = instructionText === '请基于上述随附文件/目录进行分析。';
    return {
      text: isDefaultInstruction ? '' : instructionText,
      legacyAttachments,
      isLegacyAssembled: true
    };
  }

  return {
    text: raw,
    legacyAttachments: [],
    isLegacyAssembled: false
  };
}

// Case 8a: New message format (clean content + attachments)
const newMsg = {
  content: '帮我加个缓存',
  attachments: [sampleFile]
};
const pNew = parseDisplayMessage(newMsg);
assert.strictEqual(pNew.text, '帮我加个缓存');
assert.strictEqual(pNew.isLegacyAssembled, false);
console.log('✓ parseDisplayMessage with new format passed');

// Case 8b: Legacy bloated message format (extracted context injected into content)
const bloatedMsg = {
  content: `[用户随附文件/目录上下文]:\n### 附件文件: index.ts\n\`\`\`\nconsole.log(123);\n\`\`\`\n\n### 附件文件夹目录: /root/src\n(已关联本地目录供分析与定位)\n\n[用户指令]:\n重构入口`,
  attachments: []
};
const pBloated = parseDisplayMessage(bloatedMsg);
assert.strictEqual(pBloated.text, '重构入口');
assert.strictEqual(pBloated.isLegacyAssembled, true);
assert.strictEqual(pBloated.legacyAttachments.length, 2);
assert.strictEqual(pBloated.legacyAttachments[0].name, 'index.ts');
assert.ok(pBloated.legacyAttachments[0].content.includes('console.log(123);'));
assert.strictEqual(pBloated.legacyAttachments[1].type, 'directory');
console.log('✓ parseDisplayMessage with legacy bloated format decomposes cleanly');

// Case 8c: Legacy bloated message with default placeholder
const defaultBloatedMsg = {
  content: `[用户随附文件/目录上下文]:\n### 附件文件: foo.js\n\`\`\`\nvar x = 1;\n\`\`\`\n\n[用户指令]:\n请基于上述随附文件/目录进行分析。`
};
const pDefault = parseDisplayMessage(defaultBloatedMsg);
assert.strictEqual(pDefault.text, '', 'Default instruction placeholder should be empty for cleaner display');
assert.strictEqual(pDefault.legacyAttachments[0].name, 'foo.js');
console.log('✓ parseDisplayMessage with legacy placeholder cleared passed');

console.log('ALL ATTACHMENT CONTEXT TESTS PASSED!');
