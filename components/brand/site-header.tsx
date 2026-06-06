import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

type SiteHeaderProps = {
  children?: React.ReactNode;
};

export function SiteHeader({ children }: SiteHeaderProps) {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Logo />
      {children ?? (
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/create">Open PR</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </nav>
      )}
    </header>
  );
}
