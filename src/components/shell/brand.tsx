import Image from 'next/image';

/** Display the complete lockup, trimming only the transparent canvas around it. */
export function BrandLogo({ size = 168 }: { size?: number }) {
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ width: size, height: (size * 601) / 1113 }}
    >
      <Image
        src="/Morning Brief Sunrise Logo.png"
        alt="Morning Brief"
        width={1254}
        height={1254}
        unoptimized
        className="absolute max-w-none"
        style={{
          width: (size * 1254) / 1113,
          height: (size * 1254) / 1113,
          left: (-size * 73) / 1113,
          top: (-size * 351) / 1113,
        }}
      />
    </span>
  );
}

export function BrandMark({ firm }: { firm: string }) {
  return (
    <div className="flex min-w-0 items-center" title={firm}>
      <BrandLogo />
    </div>
  );
}
