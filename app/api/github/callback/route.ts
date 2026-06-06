import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const params = new URLSearchParams();

  if (installationId) {
    params.set("installation_id", installationId);
  }

  if (setupAction) {
    params.set("setup_action", setupAction);
  }

  redirect(`/dashboard${params.size ? `?${params.toString()}` : ""}`);
}
