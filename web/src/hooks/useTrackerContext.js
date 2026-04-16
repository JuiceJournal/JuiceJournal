'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { priceAPI } from '@/lib/api';
import { getStorage, setStorage } from '@/lib/utils';

const TRACKER_CONTEXT_STORAGE_KEY = 'juice-journal-tracker-context';
const LEGACY_TRACKER_CONTEXT_STORAGE_KEY = 'poe-farm-tracker-context';
const DEFAULT_TRACKER_CONTEXT = {
  poeVersion: 'poe1',
  league: 'Standard',
};

const TrackerContext = createContext(null);

export function TrackerContextProvider({ children }) {
  const [poeVersion, setPoeVersion] = useState(DEFAULT_TRACKER_CONTEXT.poeVersion);
  const [league, setLeague] = useState(DEFAULT_TRACKER_CONTEXT.league);
  const [leagueOptions, setLeagueOptions] = useState([DEFAULT_TRACKER_CONTEXT.league]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const storedContext = getStorage(TRACKER_CONTEXT_STORAGE_KEY, null)
      || getStorage(LEGACY_TRACKER_CONTEXT_STORAGE_KEY, DEFAULT_TRACKER_CONTEXT);
    if (storedContext?.poeVersion) {
      setPoeVersion(storedContext.poeVersion);
    }
    if (storedContext?.league) {
      setLeague(storedContext.league);
    }
  }, []);

  useEffect(() => {
    setStorage(TRACKER_CONTEXT_STORAGE_KEY, {
      poeVersion,
      league: (league || DEFAULT_TRACKER_CONTEXT.league).trim() || DEFAULT_TRACKER_CONTEXT.league,
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_TRACKER_CONTEXT_STORAGE_KEY);
    }
  }, [poeVersion, league]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeagueOptions() {
      setLoadingLeagues(true);

      try {
        const response = await priceAPI.getLeagues({ poeVersion });
        const remoteLeagues = response.data?.leagues || [];
        const activeLeagues = (response.data?.activeLeagues || [])
          .map((entry) => entry?.name || entry?.displayName)
          .filter(Boolean);
        const mergedLeagues = Array.from(new Set([
          ...activeLeagues,
          (league || '').trim(),
          ...remoteLeagues,
          DEFAULT_TRACKER_CONTEXT.league,
        ].filter(Boolean)));

        if (!cancelled) {
          setLeagueOptions(mergedLeagues);
          if (!hasInitializedRef.current) {
            const preferredLeague = [
              (league || '').trim(),
              activeLeagues[0],
              mergedLeagues[0],
              DEFAULT_TRACKER_CONTEXT.league,
            ].find((value) => value && mergedLeagues.includes(value));

            if (preferredLeague && preferredLeague !== league) {
              setLeague(preferredLeague);
            }
            hasInitializedRef.current = true;
          }
        }
      } catch (error) {
        if (!cancelled) {
          const fallbackLeagues = Array.from(new Set([
            (league || '').trim(),
            DEFAULT_TRACKER_CONTEXT.league,
          ].filter(Boolean)));
          setLeagueOptions(fallbackLeagues);
          if (!league?.trim()) {
            setLeague(DEFAULT_TRACKER_CONTEXT.league);
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingLeagues(false);
        }
      }
    }

    loadLeagueOptions();

    return () => {
      cancelled = true;
    };
  }, [poeVersion, league]);

  const value = {
    poeVersion,
    setPoeVersion,
    league,
    setLeague: (nextLeague) => {
      const normalizedLeague = nextLeague || '';
      setLeague(normalizedLeague);
      setLeagueOptions((prev) => Array.from(new Set([
        normalizedLeague.trim(),
        ...prev,
      ].filter(Boolean))));
    },
    leagueOptions,
    loadingLeagues,
  };

  return (
    <TrackerContext.Provider value={value}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTrackerContext() {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error('useTrackerContext must be used within TrackerContextProvider');
  }
  return context;
}
