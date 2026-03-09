import { NextResponse } from "next/server";

function jsonResponse() {
  return NextResponse.json(
    {
      ok: true,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function GET() {
  return jsonResponse();
}

export async function POST() {
  return jsonResponse();
}
