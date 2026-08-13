import { NextResponse } from "next/server";
import { getBackendUrl } from "../../../lib/config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await fetch(`${getBackendUrl()}/matches${url.search}`, {
    cache: "no-store",
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json",
      ...(response.headers.get("x-cache") ? { "x-cache": response.headers.get("x-cache") ?? "" } : {}),
    },
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const response = await fetch(`${getBackendUrl()}/matches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: payload,
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json",
    },
  });
}