'use client';

import { useEffect, useState, useRef } from 'react';
import { getToken } from '@/lib/tokenStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    let reconnectTimer = null;

    // Establish WebSocket connection
    const connect = () => {
      const token = getToken();
      if (!token) {
        setConnected(false);
        return;
      }

      try {
        const ws = new WebSocket(WS_URL);
        socketRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'AUTH', token }));
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastMessage(data);
          } catch {
            return;
          }
        };

        ws.onclose = (event) => {
          setConnected(false);
          if (event.code !== 1008) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };

        ws.onerror = () => {};
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const sendMessage = (data) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  };

  return { connected, lastMessage, sendMessage };
}
