import Link from "next/link";
import { Suspense } from "react";
import { CreatePrClient } from "@/components/forms/create-pr-client";
import { Button } from "@/components/ui/button";

export default function CreatePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Contributor portal</p>
          <h1 className="text-3xl font-semibold tracking-tight">Pay and open a PR</h1>
        </div>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
      <Suspense fallback={<div>Loading form...</div>}>
        <CreatePrClient />
      </Suspense>
    </main>
  );
}
