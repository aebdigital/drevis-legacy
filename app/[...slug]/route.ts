import { NextResponse } from "next/server";

import { getMirrorPage } from "@/lib/mirror";

type Params = {
  params: Promise<{
    slug: string[];
  }>;
};

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  const html = await getMirrorPage(slug);

  if (!html) {
    return new NextResponse("Mirror page not found", { status: 404 });
  }

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
