import { NextResponse } from "next/server";

import { getMirrorPage } from "@/lib/mirror";

export async function GET() {
  const html = await getMirrorPage([]);
  if (!html) {
    return new NextResponse("Mirror root page not found", { status: 404 });
  }

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
