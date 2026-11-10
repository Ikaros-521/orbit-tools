/* AI Chat - line diff engine for edit_file results.
   Produces a compact unified-diff text shared by two consumers:
   - model context: readable change feedback (what was added/removed, where)
   - tool-card UI: the front-end parses the same text into colored diff rows.
   Common prefix/suffix trimming bounds the LCS matrix; oversized middle
   segments fall back to whole-block replace so replace_all on big files can
   never hang the tool call. */

const MAX_MATRIX_LINES = 900; // LCS 单边守卫：超过即回退整段替换
const DEFAULT_CONTEXT = 3;    // hunk 上下文行数

function splitLines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n');
}

/**
 * Alignment-based edit script over the trimmed middle segment.
 * Returns ops: [{t:' '|'-'|'+', text}] covering ONLY the middle; caller
 * re-attaches the common prefix/suffix rows as context ops.
 */
function buildMiddleOps(oldMid, newMid) {
  const n = oldMid.length;
  const m = newMid.length;
  if (n === 0 && m === 0) return [];
  if (n > MAX_MATRIX_LINES || m > MAX_MATRIX_LINES || n * m > MAX_MATRIX_LINES * MAX_MATRIX_LINES) {
    // 守卫回退：中段过大时放弃精细对齐，整体 del+add（行数仍受 maxDiffLines 截断）
    const ops = oldMid.map(l => ({ t: '-', text: l }));
    for (const l of newMid) ops.push({ t: '+', text: l });
    return ops;
  }

  // LCS 长度矩阵（(n+1)x(m+1)，Int32Array 一维）
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = oldMid[i] === newMid[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }

  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldMid[i] === newMid[j] && dp[i * w + j] === dp[(i + 1) * w + (j + 1)] + 1) {
      ops.push({ t: ' ', text: oldMid[i] });
      i++; j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      ops.push({ t: '-', text: oldMid[i] });
      i++;
    } else {
      ops.push({ t: '+', text: newMid[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ t: '-', text: oldMid[i++] }); }
  while (j < m) { ops.push({ t: '+', text: newMid[j++] }); }
  return ops;
}

/**
 * Build a unified diff between two texts.
 * @returns {{ text: string, stat: { added: number, removed: number } }}
 *   text 为空串表示两文本按行完全一致。
 */
function buildUnifiedDiff(oldText, newText, { maxDiffLines = 150, context = DEFAULT_CONTEXT } = {}) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  // Trim common prefix/suffix so the LCS matrix only covers the changed middle
  let p = 0;
  const maxP = Math.min(oldLines.length, newLines.length);
  while (p < maxP && oldLines[p] === newLines[p]) p++;
  let s = 0;
  const remain = Math.min(oldLines.length - p, newLines.length - p);
  while (s < remain && oldLines[oldLines.length - 1 - s] === newLines[newLines.length - 1 - s]) s++;

  const middleOps = buildMiddleOps(
    oldLines.slice(p, oldLines.length - s),
    newLines.slice(p, newLines.length - s)
  );

  let added = 0, removed = 0;
  for (const op of middleOps) {
    if (op.t === '+') added++;
    else if (op.t === '-') removed++;
  }
  if (added === 0 && removed === 0) {
    return { text: '', stat: { added: 0, removed: 0 } };
  }

  // Full op sequence with line numbers (1-based, over the ORIGINAL texts)
  const ops = [];
  let oldNo = 1, newNo = 1;
  for (let k = 0; k < p; k++) {
    ops.push({ t: ' ', text: oldLines[k], o: oldNo++, n: newNo++ });
  }
  let mi = 0, mo = oldNo, mn = newNo; // middle 起始行号
  for (const op of middleOps) {
    if (op.t === ' ') ops.push({ t: ' ', text: op.text, o: mo++, n: mn++ });
    else if (op.t === '-') ops.push({ t: '-', text: op.text, o: mo++, n: mn }); // n=删除点新行号，供纯删除 hunk 头使用
    else ops.push({ t: '+', text: op.text, n: mn++ });
  }
  oldNo = mo; newNo = mn;
  for (let k = oldLines.length - s; k < oldLines.length; k++) {
    ops.push({ t: ' ', text: oldLines[k], o: oldNo++, n: newNo++ });
  }

  // Group changed regions into hunks with `context` rows (merge near hunks)
  const changed = ops.map(op => op.t !== ' ');
  const hunks = [];
  let k = 0;
  while (k < ops.length) {
    if (!changed[k]) { k++; continue; }
    let start = Math.max(0, k - context);
    let end = k + 1; // [from, to) 排他上界：至少覆盖当前变更行
    while (end < ops.length) {
      // 向后扩展：间隔 <= 2*context 内的下一个变更并入同一 hunk
      let next = end;
      let gap = 0;
      while (next < ops.length && !changed[next] && gap < context * 2) { next++; gap++; }
      if (next < ops.length && changed[next]) { end = next + 1; }
      else break;
    }
    end = Math.min(ops.length, end + context);
    hunks.push({ from: start, to: end });
    k = end;
  }

  const outLines = [];
  for (const h of hunks) {
    let oStart = 0, nStart = 0, oCount = 0, nCount = 0;
    for (let x = h.from; x < h.to; x++) {
      const op = ops[x];
      if (op.t === '-' || op.t === ' ') { if (!oCount) oStart = op.o; oCount++; }
      if (op.t === '+' || op.t === ' ') { if (!nCount) nStart = op.n; nCount++; }
    }
    outLines.push(`@@ -${oStart},${oCount} +${nStart},${nCount} @@`);
    for (let x = h.from; x < h.to; x++) {
      const op = ops[x];
      outLines.push(`${op.t}${op.text}`);
    }
  }

  // Oversized diff: keep head & tail, fold the middle with an omission marker
  let text = outLines.join('\n');
  if (outLines.length > maxDiffLines) {
    const keep = Math.floor(maxDiffLines / 2);
    const omitted = outLines.length - keep * 2;
    text = outLines.slice(0, keep).join('\n')
      + `\n[… diff 过长，已省略中间 ${omitted} 行 …]\n`
      + outLines.slice(outLines.length - keep).join('\n');
  }

  return { text, stat: { added, removed } };
}

module.exports = {
  buildUnifiedDiff,
  MAX_MATRIX_LINES
};
