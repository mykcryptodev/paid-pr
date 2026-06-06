import { NextResponse } from "next/server";
import { searchEnabledRepoConfigs } from "@/lib/db/repositories";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const repositories = await searchEnabledRepoConfigs(query);

  return NextResponse.json({
    repositories: repositories.map((repository) => ({
      fullName: repository.repoFullName,
    })),
  });
}
