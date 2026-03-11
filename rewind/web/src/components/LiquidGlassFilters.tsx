import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDisplacementMap,
  headerFragment,
  HEADER_FILTER_ID,
  CARD_FILTER_ID,
} from "../lib/liquid-glass";

const HEADER_BUCKET_X = 12;
const HEADER_BUCKET_Y = 6;

function quantize(value: number, buckets: number): number {
  return Math.round(value * buckets) / buckets;
}

export default function LiquidGlassFilters() {
  const feImageRef = useRef<SVGFEImageElement>(null);
  const feScaleRef = useRef<SVGFEDisplacementMapElement>(null);
  const [interactive, setInteractive] = useState(false);
  const lastBucketRef = useRef<string>("");

  const applyHeaderFilter = useCallback((x: number, y: number) => {
    const qx = quantize(Math.max(0, Math.min(1, x)), HEADER_BUCKET_X);
    const qy = quantize(Math.max(0, Math.min(1, y)), HEADER_BUCKET_Y);
    const bucketKey = `${qx}:${qy}`;

    if (bucketKey === lastBucketRef.current) {
      return;
    }
    lastBucketRef.current = bucketKey;

    const { dataUrl, scale } = generateDisplacementMap(120, 36, headerFragment, {
      x: qx,
      y: qy,
    });

    feImageRef.current?.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      dataUrl,
    );
    feScaleRef.current?.setAttribute("scale", String(scale));
  }, []);

  useEffect(() => {
    applyHeaderFilter(0.5, 0.5);
  }, [applyHeaderFilter]);

  useEffect(() => {
    const media = window.matchMedia(
      "(pointer: fine) and (prefers-reduced-motion: no-preference)",
    );

    const updateInteractive = () => {
      setInteractive(media.matches);
    };

    updateInteractive();
    media.addEventListener("change", updateInteractive);
    return () => media.removeEventListener("change", updateInteractive);
  }, []);

  useEffect(() => {
    if (!interactive) {
      applyHeaderFilter(0.5, 0.5);
      return;
    }

    const header = document.querySelector<HTMLElement>("[data-liquid-header]");
    if (!header) {
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = header.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (x < -0.2 || x > 1.2 || y < -0.5 || y > 1.5) {
        return;
      }

      applyHeaderFilter(x, y);
    };

    const onPointerLeave = () => {
      applyHeaderFilter(0.5, 0.5);
    };

    header.addEventListener("pointermove", onPointerMove, { passive: true });
    header.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      header.removeEventListener("pointermove", onPointerMove);
      header.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [applyHeaderFilter, interactive]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        <filter id={CARD_FILTER_ID}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.016"
            numOctaves={2}
            seed={5}
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={4}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

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
