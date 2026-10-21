const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const win32Probe = require('../src/modules/win32Probe');

const skip = process.platform !== 'win32' && 'Win32 probe only runs on Windows';

test('PROCESSENTRY32W layout constants match the Windows x64 struct', { skip }, () => {
  const koffi = require('koffi');
  const entry = koffi.struct('JJ_TEST_PROCESSENTRY32W', {
    dwSize: 'uint32_t',
    cntUsage: 'uint32_t',
    th32ProcessID: 'uint32_t',
    th32DefaultHeapID: 'uintptr_t',
    th32ModuleID: 'uint32_t',
    cntThreads: 'uint32_t',
    th32ParentProcessID: 'uint32_t',
    pcPriClassBase: 'int32_t',
    dwFlags: 'uint32_t',
    szExeFile: koffi.array('char16_t', 260)
  });

  assert.equal(koffi.sizeof(entry), win32Probe.PROCESSENTRY32W_SIZE);
  assert.equal(koffi.offsetof(entry, 'th32ProcessID'), 8);
  assert.equal(koffi.offsetof(entry, 'szExeFile'), 44);
});

test('win32 probe finds the current process with its full image path', { skip }, () => {
  const exeName = path.basename(process.execPath);
  const matches = win32Probe.scanProcesses([exeName.toUpperCase()]);
  const self = matches.find((entry) => entry.ProcessId === process.pid);

  assert.ok(self, `expected ${exeName} pid ${process.pid} in the snapshot`);
  assert.equal(self.Name.toLowerCase(), exeName.toLowerCase());
  assert.equal(self.ExecutablePath.toLowerCase(), process.execPath.toLowerCase());
});

test('win32 probe returns no window for unknown processes', { skip }, () => {
  assert.equal(win32Probe.findProcessWindow([]), null);
  assert.equal(win32Probe.findProcessWindow([process.pid], 'JJNoSuchWindowClass'), null);
});
