/**
 * Win32 Probe Module
 * Polling-only Windows queries used for game detection: the process list, a process's image path and
 * the client rectangle of its game window. No hooks, no injection and no access to another process's
 * memory; the only process handle opened is PROCESS_QUERY_LIMITED_INFORMATION, closed right away.
 *
 * koffi is loaded lazily so that a missing or blocked native module leaves callers on their fallback path.
 */

const TH32CS_SNAPPROCESS = 0x2;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const INVALID_HANDLE_VALUE = -1;
// PROCESSENTRY32W on x64: dwSize @0, th32ProcessID @8, szExeFile[MAX_PATH] @44, padded to 568 bytes.
const PROCESSENTRY32W_SIZE = 568;
const PROCESSENTRY32W_PID_OFFSET = 8;
const PROCESSENTRY32W_EXE_OFFSET = 44;
const MAX_PATH_CHARS = 260;
const MAX_IMAGE_PATH_CHARS = 32768;
const MAX_WINDOWS_PER_CLASS = 64;

let api = null;
let loadError = null;

function loadApi() {
  if (api || loadError) {
    return api;
  }

  if (process.platform !== 'win32') {
    loadError = new Error('Win32 probe is only available on Windows');
    return null;
  }

  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    koffi.struct('JJ_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
    koffi.struct('JJ_POINT', { x: 'int32_t', y: 'int32_t' });

    api = {
      CreateToolhelp32Snapshot: kernel32.func('intptr_t __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
      Process32FirstW: kernel32.func('bool __stdcall Process32FirstW(intptr_t snapshot, void *entry)'),
      Process32NextW: kernel32.func('bool __stdcall Process32NextW(intptr_t snapshot, void *entry)'),
      OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
      QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t process, uint32_t flags, void *buffer, _Inout_ uint32_t *size)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t handle)'),
      FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 className, str16 title)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
      GetClientRect: user32.func('bool __stdcall GetClientRect(intptr_t hwnd, _Out_ JJ_RECT *rect)'),
      ClientToScreen: user32.func('bool __stdcall ClientToScreen(intptr_t hwnd, _Inout_ JJ_POINT *point)')
    };
  } catch (error) {
    loadError = error;
    api = null;
  }

  return api;
}

function isAvailable() {
  return Boolean(loadApi());
}

function getLoadError() {
  loadApi();
  return loadError;
}

function readWideString(buffer, offset, maxChars) {
  const text = buffer.toString('utf16le', offset, offset + maxChars * 2);
  const end = text.indexOf('\0');
  return end >= 0 ? text.slice(0, end) : text;
}

function readImagePath(win, pid) {
  const handle = win.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (!handle) {
    return '';
  }

  try {
    const buffer = Buffer.alloc(MAX_IMAGE_PATH_CHARS * 2);
    const size = [MAX_IMAGE_PATH_CHARS];
    return win.QueryFullProcessImageNameW(handle, 0, buffer, size)
      ? buffer.toString('utf16le', 0, size[0] * 2)
      : '';
  } finally {
    win.CloseHandle(handle);
  }
}

/**
 * Snapshot running processes whose exe name is in `names` (case-insensitive).
 * Returns null when the probe is unavailable, otherwise [{ Name, ProcessId, ExecutablePath }].
 */
function scanProcesses(names = []) {
  const win = loadApi();
  if (!win) {
    return null;
  }

  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  const snapshot = win.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (!snapshot || snapshot === INVALID_HANDLE_VALUE) {
    throw new Error('CreateToolhelp32Snapshot failed');
  }

  const entry = Buffer.alloc(PROCESSENTRY32W_SIZE);
  entry.writeUInt32LE(PROCESSENTRY32W_SIZE, 0);
  const matches = [];

  try {
    for (let ok = win.Process32FirstW(snapshot, entry); ok; ok = win.Process32NextW(snapshot, entry)) {
      const name = readWideString(entry, PROCESSENTRY32W_EXE_OFFSET, MAX_PATH_CHARS);
      if (wanted.has(name.toLowerCase())) {
        const pid = entry.readUInt32LE(PROCESSENTRY32W_PID_OFFSET);
        matches.push({ Name: name, ProcessId: pid, ExecutablePath: readImagePath(win, pid) });
      }
    }
  } finally {
    win.CloseHandle(snapshot);
  }

  return matches;
}

/**
 * Find the first visible top-level window of `className` owned by one of `pids`.
 * Returns its client rectangle in physical screen pixels, or null.
 */
function findProcessWindow(pids = [], className = 'POEWindowClass') {
  const win = loadApi();
  const wanted = new Set(pids.map(Number).filter(Boolean));
  if (!win || wanted.size === 0) {
    return null;
  }

  let hwnd = 0;
  for (let index = 0; index < MAX_WINDOWS_PER_CLASS; index += 1) {
    hwnd = win.FindWindowExW(0, hwnd, className, null);
    if (!hwnd) {
      return null;
    }

    const owner = [0];
    win.GetWindowThreadProcessId(hwnd, owner);
    if (!wanted.has(owner[0]) || !win.IsWindowVisible(hwnd)) {
      continue;
    }

    const rect = {};
    const origin = { x: 0, y: 0 };
    if (!win.GetClientRect(hwnd, rect) || !win.ClientToScreen(hwnd, origin)) {
      return null;
    }

    return {
      x: origin.x,
      y: origin.y,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      minimized: Boolean(win.IsIconic(hwnd))
    };
  }

  return null;
}

module.exports = {
  isAvailable,
  getLoadError,
  scanProcesses,
  findProcessWindow,
  PROCESSENTRY32W_SIZE
};
