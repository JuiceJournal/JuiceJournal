(function () {
  const FEATURES = ['gep_internal', 'me', 'match_info', 'game_info', 'death', 'kill'];
  const GAME_IDS = [7212, 24886];
  const output = document.getElementById('output');
  const startButton = document.getElementById('start');

  function append(record) {
    const timestamp = new Date().toISOString();
    output.textContent += `\n\n[${timestamp}]\n${JSON.stringify(record, null, 2)}`;
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

  function getOverwolfEventsApi() {
    return window.overwolf?.games?.events || null;
  }

  function setRequiredFeatures(eventsApi, features) {
    return new Promise((resolve) => {
      if (typeof eventsApi?.setRequiredFeatures !== 'function') {
        resolve({ success: false, reason: 'setRequiredFeatures unavailable' });
        return;
      }

      eventsApi.setRequiredFeatures(features, (result) => {
        resolve(result || { success: true });
      });
    });
  }

  function wireEvents(eventsApi) {
    if (eventsApi?.onInfoUpdates2?.addListener) {
      eventsApi.onInfoUpdates2.addListener((payload) => {
        append({ type: 'info', payload: sanitizePayload(payload) });
      });
    }

    if (eventsApi?.onNewEvents?.addListener) {
      eventsApi.onNewEvents.addListener((payload) => {
        append({ type: 'event', payload: sanitizePayload(payload) });
      });
    }
  }

  async function startCapture() {
    output.textContent = 'Starting Overwolf GEP capture...';
    const eventsApi = getOverwolfEventsApi();

    if (!eventsApi) {
      append({
        type: 'error',
        message: 'overwolf.games.events is unavailable. Run this harness inside Overwolf ow-electron.'
      });
      return;
    }

    append({
      type: 'target-games',
      gameIds: GAME_IDS,
      features: FEATURES
    });

    const result = await setRequiredFeatures(eventsApi, FEATURES);
    append({ type: 'set-required-features', result });
    wireEvents(eventsApi);
  }

  startButton.addEventListener('click', () => {
    startCapture().catch((error) => {
      append({
        type: 'error',
        message: error?.message || String(error)
      });
    });
  });
})();
