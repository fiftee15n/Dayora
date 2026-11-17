import Link from "next/link";

import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
