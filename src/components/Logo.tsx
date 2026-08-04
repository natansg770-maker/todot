"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type LogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

type LogoMeta = {
  src?: string;
  version?: number;
};

export function Logo({ size = 160, className = "", priority = false }: LogoProps) {
  const [meta, setMeta] = useState<LogoMeta>({ src: "/brand/logo.png", version: 0 });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/logo", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: LogoMeta) => {
        if (cancelled) return;
        setMeta({
          src: data.src || "/brand/logo.png",
          version: data.version || Date.now(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMeta({ src: "/brand/logo.png", version: Date.now() });
        }
      });

    function onUpdated(event: Event) {
      const detail = (event as CustomEvent<LogoMeta>).detail;
      if (detail?.src) {
        setMeta({
          src: detail.src,
          version: detail.version || Date.now(),
        });
      }
    }

    window.addEventListener("logo-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("logo-updated", onUpdated);
    };
  }, []);

  const src = `${meta.src || "/brand/logo.png"}?v=${meta.version || 0}`;

  return (
    <Image
      src={src}
      alt="קעמפ גן ישראל משפחת השלוחים הצעירים"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={`select-none object-contain ${className}`}
    />
  );
}
