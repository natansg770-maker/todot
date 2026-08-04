import Image from "next/image";

type LogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function Logo({ size = 160, className = "", priority = false }: LogoProps) {
  return (
    <Image
      src="/brand/logo.png"
      alt="קעמפ גן ישראל משפחת השלוחים הצעירים"
      width={size}
      height={size}
      priority={priority}
      className={`select-none ${className}`}
    />
  );
}
