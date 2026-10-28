/* 剪贴板自动触发场景：真实系统剪贴板 + 短轮询 watcher。
   覆盖：类型匹配、自动运行、回写防循环、禁用豁免。
   注意：这些场景会真实修改系统剪贴板内容。 */
module.exports = {
  scenarios: [
    {
      name: '任意文本触发 + 类型匹配过滤',
      run: async ({ wfManager, events, clipboard, waitFor, sleep, fail }) => {
        const stamp = Date.now();
        wfManager.save({
          id: 'wf-any', name: 'any-trigger', enabled: true,
          nodes: [
            { id: 'n1', type: 'trigger/clipboard', title: '任意剪贴板', config: { type: 'any' } },
            { id: 'n2', type: 'util/text-template', title: '打标', config: { template: '{{value}}' } },
          ], edges: [{ from: 'n1', to: 'n2' }],
        });
        wfManager.save({
          id: 'wf-json-only', name: 'json-only-trigger', enabled: true,
          nodes: [
            { id: 'n1', type: 'trigger/clipboard', title: '仅 JSON', config: { type: 'application/json' } },
          ], edges: [],
        });

        clipboard.writeText(`plain-${stamp}`);
        await waitFor('任意文本工作流自动运行', () => events.some(e => e.id === 'wf-any'));
        await sleep(400); // 给 json-only 足够的"不该触发"窗口
        if (events.some(e => e.id === 'wf-json-only')) fail('纯文本不应触发 JSON 专属工作流');
        const anyEvt = events.find(e => e.id === 'wf-any');
        if (anyEvt.detectedType !== 'text/plain') fail(`应识别为 text/plain，实际 ${anyEvt.detectedType}`);
        if (!anyEvt.ok) fail(`任意文本工作流应成功: ${anyEvt.error}`);

        clipboard.writeText(`{"n":${stamp}}`);
        await waitFor('JSON 专属工作流自动运行', () => events.some(e => e.id === 'wf-json-only'));
        const jsonEvt = events.find(e => e.id === 'wf-json-only');
        if (jsonEvt.detectedType !== 'application/json') fail(`应识别为 application/json，实际 ${jsonEvt.detectedType}`);
      },
    },
    {
      name: '输出回写剪贴板不引发循环触发',
      run: async ({ wfManager, events, clipboard, waitFor, sleep, fail }) => {
        const stamp = Date.now();
        wfManager.save({
          id: 'wf-fmt', name: 'format-loop-guard', enabled: true,
          nodes: [
            { id: 'n1', type: 'trigger/clipboard', title: 'JSON 监听', config: { type: 'application/json' } },
            { id: 'n2', type: 'action/plugin', pluginId: 'json-editor', capabilityId: 'json-format', title: '格式化' },
            { id: 'n3', type: 'output/clipboard', title: '写回剪贴板' },
          ],
          edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
        });

        clipboard.writeText(`{"s":${stamp},"minified":true}`);
        await waitFor('格式化工作流自动运行', () => events.some(e => e.id === 'wf-fmt'));
        await waitFor('格式化结果写回剪贴板', () => clipboard.readText().includes('\n  '));

        const before = events.filter(e => e.id === 'wf-fmt').length;
        await sleep(1000); // 数个轮询周期，若防循环失效这里会反复触发
        const after = events.filter(e => e.id === 'wf-fmt').length;
        if (after !== before) fail(`写回剪贴板引发了重复触发 (${before} → ${after})`);
      },
    },
    {
      name: '禁用的工作流不会被自动触发',
      run: async ({ wfManager, events, clipboard, waitFor, sleep, fail }) => {
        const stamp = Date.now();
        wfManager.save({
          id: 'wf-off', name: 'disabled-should-not-run', enabled: false,
          nodes: [{ id: 'n1', type: 'trigger/clipboard', title: '监听', config: { type: 'any' } }], edges: [],
        });

        clipboard.writeText(`should-not-trigger-${stamp}`);
        await sleep(800); // 超过多个轮询周期
        if (events.some(e => e.id === 'wf-off')) fail('禁用工作流被自动触发了');

        // 重新启用后应恢复触发（验证 watcher 按保存状态动态启停）
        wfManager.save({
          id: 'wf-off', name: 'disabled-should-not-run', enabled: true,
          nodes: [{ id: 'n1', type: 'trigger/clipboard', title: '监听', config: { type: 'any' } }], edges: [],
        });
        clipboard.writeText(`now-trigger-${stamp}`);
        await waitFor('启用后工作流自动运行', () => events.some(e => e.id === 'wf-off'));
      },
    },
  ],
};
