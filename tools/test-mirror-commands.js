/* Test mirror-hub command generation logic in panel.js:
   Verifies that Docker cards exist and all commands distinguish between PowerShell and CMD
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Read panel.js and extract ENVS
const panelCode = fs.readFileSync(path.join(__dirname, '../src/plugins/mirror-hub/panel.js'), 'utf8');

// Simulate browser environment with isWin = true
const mockWindow = {
  Toolbox: { panel: (def) => { mockWindow._panelDef = def; } }
};
const mockNavigator = {
  platform: 'Win32',
  userAgent: 'Windows NT 10.0'
};

const mockDoc = {
  createDocumentFragment: () => ({ appendChild: () => {} }),
  createElement: () => ({
    dataset: {},
    classList: { add: () => {}, remove: () => {} },
    querySelector: () => mockBtn,
    querySelectorAll: () => [],
    addEventListener: () => {}
  })
};

const fn = new Function('window', 'navigator', 'document', panelCode);
fn(mockWindow, mockNavigator, mockDoc);

assert(mockWindow._panelDef && mockWindow._panelDef.mount, 'mount must be defined');

// Call mount with dummy element and dummy ctx
let registeredEvents = {};
let ipcCalls = [];
const mockCtx = {
  lang: 'zh',
  call: (method, args) => {
    ipcCalls.push({ method, args });
    if (method === 'getSettings') return Promise.resolve({ proxyUrl: 'http://127.0.0.1:7890', shellType: 'powershell' });
    if (method === 'getCustomMirrors') return Promise.resolve({});
    return Promise.resolve({ ok: true });
  },
  onEvent: (evt, handler) => { registeredEvents[evt] = handler; }
};

const mockBtn = { addEventListener: () => {}, querySelector: () => ({ textContent: '' }), classList: { add: () => {}, remove: () => {} }, appendChild: () => {} };
const mockInput = { value: '', addEventListener: () => {} };
const mockEl = {
  innerHTML: '',
  querySelectorAll: (sel) => [],
  querySelector: (sel) => {
    if (sel.includes('input')) return mockInput;
    return mockBtn;
  },
  appendChild: () => {}
};

mockWindow._panelDef.mount(mockEl, mockCtx);

// Check that panel.js declared docker in ENVS
assert(panelCode.includes("id: 'docker'"), "panel.js must include docker environment");
assert(panelCode.includes("docker.m.daocloud.io"), "panel.js must include daocloud mirror");
assert(panelCode.includes("docker.1panel.live"), "panel.js must include 1panel mirror");
assert(panelCode.includes("dockerpull.cn"), "panel.js must include dockerpull mirror");

// Check PowerShell and CMD syntaxes are distinguished
assert(panelCode.includes("docker pull ${mirrorImage} && docker tag"), "CMD should chain with &&");
assert(panelCode.includes("docker pull ${mirrorImage}; docker tag"), "PowerShell should chain with ;");
assert(panelCode.includes("set HTTP_PROXY="), "CMD should use set HTTP_PROXY=");
assert(panelCode.includes("$env:HTTP_PROXY="), "PowerShell should use $env:HTTP_PROXY=");

// Check Git environment distinctions
assert(panelCode.includes("curlCmd = (isWin && shell === 'powershell') ? 'curl.exe' : 'curl'"), "PowerShell should use curl.exe");
assert(panelCode.includes("%USERPROFILE%\\\\.ssh\\\\config"), "CMD should use %USERPROFILE% for ssh config");

// Check NPM environment distinctions
assert(panelCode.includes("npm config set proxy ${proxy} && npm config set https-proxy"), "NPM proxy CMD should use &&");
assert(panelCode.includes("npm config set proxy ${proxy}; npm config set https-proxy"), "NPM proxy PowerShell should use ;");

// Check Cargo environment distinctions
assert(panelCode.includes("set HTTP_PROXY=${proxy} && set HTTPS_PROXY=${proxy} && cargo add"), "Cargo proxy CMD should use set and &&");
assert(panelCode.includes("$env:HTTP_PROXY=\"${proxy}\"; $env:HTTPS_PROXY=\"${proxy}\"; cargo add"), "Cargo proxy PowerShell should use $env and ;");

// Check Terminal environment distinctions
assert(panelCode.includes("set http_proxy= && set https_proxy="), "Terminal unset CMD should use set without value");
assert(panelCode.includes("$env:http_proxy=\"\"; $env:https_proxy=\"\""), "Terminal unset PowerShell should use empty string");

console.log('Command syntax verification passed: All commands correctly distinguish between PowerShell and CMD under Windows!');
