import { useCallback, useEffect, useState } from 'react';
import type { EnvironmentState } from '../data/environment';

/** The environment snapshot every tab reads, loaded once per app start and again on 重试. */
export function useEnvironmentState() {
  const [environmentState, setEnvironmentState] = useState<EnvironmentState | null>(null);
  const [environmentLoadFailed, setEnvironmentLoadFailed] = useState(false);
  // Bumped by 重试 on the failure screen (01-08) and by the 离线 / 可能过期 notices (01-09,
  // N01-14); re-running the effect is the whole retry, there is no separate fetch path.
  const [environmentLoadAttempt, setEnvironmentLoadAttempt] = useState(0);

  const retryEnvironmentLoad = useCallback(() => {
    setEnvironmentLoadFailed(false);
    setEnvironmentLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let active = true;
    import('../data/environment')
      .then(({ loadEnvironmentState }) => loadEnvironmentState())
      .then((nextState) => {
        if (!active) return;
        setEnvironmentState(nextState);
        setEnvironmentLoadFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setEnvironmentState(null);
        setEnvironmentLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [environmentLoadAttempt]);

  return { environmentState, environmentLoadFailed, retryEnvironmentLoad };
}
