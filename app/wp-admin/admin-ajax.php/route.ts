import { NextResponse } from "next/server";

const EMPTY_SUCCESS = {
  success: true,
  data: {},
};

function jsonResponse() {
  return NextResponse.json(EMPTY_SUCCESS, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  return jsonResponse();
}

export async function POST() {
  return jsonResponse();
}
