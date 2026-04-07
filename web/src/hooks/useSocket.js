'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { authAPI } from '@/lib/api';

function resolveWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (process.env.NODE_ENV === 'production') {
    if (!envUrl) {
      throw new Error(
        'NEXT_PUBLIC_WS_URL environment variable is required in production.'
      );
    }
    if (!envUrl.startsWith('wss://')) {
      console.error(
        `[useSocket] NEXT_PUBLIC_WS_URL must use wss:// in production, got: ${envUrl}`
      );
    }
    return envUrl;
  }
  return envUrl || 'wss://localhost:3001';
}

const WS_URL = resolveWsUrl();

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const socketRef = useRef(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 20;
  const MIN_DELAY = 3000;
  const MAX_DELAY = 60000;

  useEffect(() => {
    let reconnectTimer = null;

    // Establish WebSocket connection
    const connect = async () => {
      try {
        const tokenResponse = await authAPI.getRealtimeToken();
        const token = tokenResponse?.data?.token;
        if (!token) {
          setConnected(false);
          return;
        }

        const ws = new WebSocket(WS_URL);
        socketRef.current = ws;

        ws.onopen = () => {
          retryCountRef.current = 0;
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
            retryCountRef.current = Math.min(retryCountRef.current + 1, MAX_RETRIES);
            const delay = Math.min(MIN_DELAY * Math.pow(2, retryCountRef.current - 1), MAX_DELAY);
            reconnectTimer = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => { };
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
