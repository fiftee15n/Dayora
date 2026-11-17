import { cn, initials } from "@/lib/utils";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("size-10 rounded-full object-cover", className)} />;
  }
  return (
    <div
      className={cn(
        "brand-gradient grid size-10 place-items-center rounded-full text-sm font-semibold text-white",
        className,
      )}
      aria-label={name}
    >
      {initials(name) || "·"}
    </div>
  );
}
