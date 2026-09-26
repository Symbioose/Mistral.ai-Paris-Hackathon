import { updateSession } from "@/app/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Public avatar/audio modules need no session refresh. Avoid an auth round trip per asset.
    "/((?!_next/static|_next/image|favicon.ico|avatar/|audio/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
