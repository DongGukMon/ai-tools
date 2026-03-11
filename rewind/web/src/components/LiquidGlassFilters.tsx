import { useEffect, useRef, useCallback, useState } from "react";
import {
  generateDisplacementMap,
  headerFragment,
  HEADER_FILTER_ID,
  CARD_FILTER_ID,
} from "../lib/liquid-glass";

export function LiquidGlassFilters() {
  const feImageRef = useRef<SVGFEImageElement>(null);
  const feScaleRef = useRef<SVGFEDisplacementMapElement>(null);
  const [ready, setReady] = useState(false);

  // Generate initial header displacement map
  useEffect(() => {
    const { dataUrl, scale } = generateDisplacementMap(
      120,
      36,
      headerFragment,
    );
    if (feImageRef.current && feScaleRef.current) {
      feImageRef.current.setAttributeNS(
        "http://www.w3.org/1999/xlink",
        "href",
        dataUrl,
      );
      feScaleRef.current.setAttribute("scale", String(scale));
    }
    setReady(true);
  }, []);

  // Mouse tracking for interactive header refraction
  const onMove = useCallback((e: MouseEvent) => {
    const el = document.querySelector("[data-liquid-header]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    // Only update when mouse is near the header
    if (mx < -0.3 || mx > 1.3 || my < -1 || my > 2) return;

    const { dataUrl, scale } = generateDisplacementMap(120, 36, headerFragment, {
      x: Math.max(0, Math.min(1, mx)),
      y: Math.max(0, Math.min(1, my)),
    });
    feImageRef.current?.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      dataUrl,
    );
    feScaleRef.current?.setAttribute("scale", String(scale));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let ticking = false;
    const throttled = (e: MouseEvent) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onMove(e);
        ticking = false;
      });
    };
    window.addEventListener("mousemove", throttled, { passive: true });
    return () => window.removeEventListener("mousemove", throttled);
  }, [ready, onMove]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        {/* Card filter: organic turbulence displacement */}
        <filter id={CARD_FILTER_ID}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.016"
            numOctaves={3}
            seed={5}
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={5}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Header filter: canvas displacement with mouse tracking */}
        <filter
          id={HEADER_FILTER_ID}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="2000"
          height="200"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            ref={feImageRef}
            width="2000"
            height="200"
            preserveAspectRatio="none"
            result="m"
          />
          <feDisplacementMap
            ref={feScaleRef}
            in="SourceGraphic"
            in2="m"
            scale={12}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
