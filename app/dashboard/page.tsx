import Link from "next/link";
import { DashboardClient } from "@/components/forms/dashboard-client";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Maintainer dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight">Configure PaidPR</h1>
        </div>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
      <DashboardClient />
    </main>
  );
}
