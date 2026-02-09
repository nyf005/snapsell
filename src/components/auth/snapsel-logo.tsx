import Image from "next/image";

import { cn } from "~/lib/utils";

export function SnapSellLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 items-center justify-center rounded-lg bg-white p-1",
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="SnapSell"
        width={80}
        height={80}
        className="h-full w-full object-contain"
        priority
      />
    </div>
  );
}
