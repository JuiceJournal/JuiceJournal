(function () {
  const output = document.getElementById('output');
  const startButton = document.getElementById('start');

  function append(record) {
    const timestamp = new Date().toISOString();
    output.textContent += `\n\n[${timestamp}]\n${JSON.stringify(sanitizeRecord(record), null, 2)}`;
  }

  function redactChatEvent(event) {
    if (!event || typeof event !== 'object') {
      return event;
    }

    const name = String(event.name || event.event || '').toLowerCase();
    if (name !== 'chat') {
      return event;
    }

    return {
      ...event,
      data: '[redacted-chat-event]'
    };
  }

  function sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    if (Array.isArray(payload.events)) {
      return {
        ...payload,
        events: payload.events.map(redactChatEvent)
      };
    }

    return redactChatEvent(payload);
  }

  function sanitizeRecord(record) {
    if (!record || typeof record !== 'object') {
      return record;
    }

    if (record.payload) {
      return {
        ...record,
        payload: sanitizePayload(record.payload)
      };
    }

    return sanitizePayload(record);
  }

  async function startCapture() {
    output.textContent = 'Starting Overwolf GEP capture...';
    const captureApi = window.gepCapture;

    if (!captureApi || typeof captureApi.start !== 'function') {
      append({
        type: 'error',
        message: 'GEP capture bridge is unavailable. Run this harness with ow-electron.'
      });
      return;
    }

    const result = await captureApi.start();
    append({ type: 'start-result', result });
  }

  window.gepCapture?.onRecord?.((record) => {
    append(record);
  });

  startButton.addEventListener('click', () => {
    startCapture().catch((error) => {
      append({
        type: 'error',
        message: error?.message || String(error)
      });
    });
  });
})();
