(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.hotkeyModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHotkeyModel() {
  const DEFAULT_SCAN_HOTKEY = 'F9';
  const DEFAULT_STASH_SCAN_HOTKEY = 'CommandOrControl+Shift+L';
  const MODIFIER_ORDER = ['CommandOrControl', 'Alt', 'Shift'];
  const MODIFIER_MAP = Object.freeze({
    cmdorctrl: 'CommandOrControl',
    commandorcontrol: 'CommandOrControl',
    ctrl: 'CommandOrControl',
    control: 'CommandOrControl',
    cmd: 'CommandOrControl',
    command: 'CommandOrControl',
    meta: 'CommandOrControl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift'
  });
  const KEY_ALIAS_MAP = Object.freeze({
    ' ': 'Space',
    space: 'Space',
    tab: 'Tab',
    enter: 'Enter',
    return: 'Enter',
    esc: 'Escape',
    escape: 'Escape',
    up: 'Up',
    arrowup: 'Up',
    down: 'Down',
    arrowdown: 'Down',
    left: 'Left',
    arrowleft: 'Left',
    right: 'Right',
    arrowright: 'Right',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    delete: 'Delete',
    del: 'Delete',
    insert: 'Insert',
    backspace: 'Backspace'
  });

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  function normalizeKeyToken(token) {
    const trimmed = String(token || '').trim();
    if (!trimmed) {
      return '';
    }

    const lowered = trimmed.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(KEY_ALIAS_MAP, lowered)) {
      return KEY_ALIAS_MAP[lowered];
    }

    const upper = trimmed.toUpperCase();
    if (/^F([1-9]|1\d|2[0-4])$/.test(upper)) {
      return upper;
    }

    if (/^[A-Z0-9]$/.test(upper)) {
      return upper;
    }

    return titleCase(trimmed);
  }

  function normalizeAccelerator(accelerator) {
    const trimmed = String(accelerator || '').trim();
    if (!trimmed) {
      throw new Error('Hotkey is required');
    }

    const tokens = trimmed
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean);

    if (!tokens.length) {
      throw new Error('Hotkey is required');
    }

    const modifiers = new Set();
    let keyToken = '';

    for (const token of tokens) {
      const modifier = MODIFIER_MAP[token.toLowerCase()];
      if (modifier) {
        modifiers.add(modifier);
        continue;
      }

      if (keyToken) {
        throw new Error('Hotkey must include only one non-modifier key');
      }

      keyToken = normalizeKeyToken(token);
    }

    if (!keyToken) {
      throw new Error('Hotkey must include a non-modifier key');
    }

    return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), keyToken].join('+');
  }

  function normalizeKeyboardEventKey(key) {
    const normalizedKey = String(key || '').toLowerCase();
    if (
      normalizedKey === 'control'
      || normalizedKey === 'ctrl'
      || normalizedKey === 'shift'
      || normalizedKey === 'alt'
      || normalizedKey === 'meta'
      || normalizedKey === 'command'
      || normalizedKey === 'os'
    ) {
      return '';
    }

    return normalizeKeyToken(key);
  }

  function formatKeyboardEventToAccelerator(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('Keyboard event is required');
    }

    const keyToken = normalizeKeyboardEventKey(event.key);
    if (!keyToken) {
      throw new Error('Hotkey must include a non-modifier key');
    }

    const tokens = [];
    if (event.ctrlKey || event.metaKey) {
      tokens.push('CommandOrControl');
    }
    if (event.altKey) {
      tokens.push('Alt');
    }
    if (event.shiftKey) {
      tokens.push('Shift');
    }
    tokens.push(keyToken);

    return normalizeAccelerator(tokens.join('+'));
  }

  function formatAcceleratorForDisplay(accelerator, options = {}) {
    const normalizedAccelerator = normalizeAccelerator(accelerator);
    const platform = String(options.platform || 'win32').toLowerCase();
    const modifierLabels = {
      CommandOrControl: platform.includes('mac') || platform === 'darwin' ? 'Cmd' : 'Ctrl',
      Alt: platform.includes('mac') || platform === 'darwin' ? 'Option' : 'Alt',
      Shift: 'Shift'
    };

    return normalizedAccelerator
      .split('+')
      .map((token) => modifierLabels[token] || token)
      .join('+');
  }

  function validateHotkeys({ scanHotkey, stashScanHotkey } = {}) {
    const normalizedScanHotkey = normalizeAccelerator(scanHotkey || DEFAULT_SCAN_HOTKEY);
    const normalizedStashScanHotkey = normalizeAccelerator(stashScanHotkey || DEFAULT_STASH_SCAN_HOTKEY);

    if (normalizedScanHotkey === normalizedStashScanHotkey) {
      throw new Error('Hotkeys must be unique');
    }

    return {
      scanHotkey: normalizedScanHotkey,
      stashScanHotkey: normalizedStashScanHotkey
    };
  }

  return {
    DEFAULT_SCAN_HOTKEY,
    DEFAULT_STASH_SCAN_HOTKEY,
    formatAcceleratorForDisplay,
    formatKeyboardEventToAccelerator,
    normalizeAccelerator,
    validateHotkeys
  };
});
