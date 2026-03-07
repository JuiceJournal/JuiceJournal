'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { priceAPI } from '@/lib/api';
import { getStorage, setStorage } from '@/lib/utils';

const TRACKER_CONTEXT_STORAGE_KEY = 'poe-farm-tracker-context';
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

  useEffect(() => {
    const storedContext = getStorage(TRACKER_CONTEXT_STORAGE_KEY, DEFAULT_TRACKER_CONTEXT);
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
  }, [poeVersion]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeagueOptions() {
      setLoadingLeagues(true);

      try {
        const response = await priceAPI.getLeagues({ poeVersion });
        const remoteLeagues = response.data?.leagues || [];
        const mergedLeagues = Array.from(new Set([
          (league || '').trim(),
          DEFAULT_TRACKER_CONTEXT.league,
          ...remoteLeagues,
        ].filter(Boolean)));

        if (!cancelled) {
          setLeagueOptions(mergedLeagues);
          if (!league?.trim()) {
            setLeague(mergedLeagues[0] || DEFAULT_TRACKER_CONTEXT.league);
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
