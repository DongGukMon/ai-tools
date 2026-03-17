import { useState, useEffect } from "react";
import { platform } from "../lib/platform";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    platform.isFullscreen().then(setIsFullscreen);

    const unlisten = platform.onResized(() => {
      platform.isFullscreen().then(setIsFullscreen);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return isFullscreen;
}
