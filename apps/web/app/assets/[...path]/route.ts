import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_UPSTREAM = process.env.API_UPSTREAM ?? "http://127.0.0.1:41238";
const STRIP_HEADERS = new Set(["host", "connection", "content-length"]);

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function buildTarget(pathSegments: string[], search: string): URL {
  const joined = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(`/assets/${joined}`, API_UPSTREAM);
  url.search = search;
  return url;
}

function copyRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const resolved = await context.params;
  const segments = resolved.path ?? [];
  const target = buildTarget(segments, request.nextUrl.search);

  const upstream = await fetch(target, {
    method: request.method,
    headers: copyRequestHeaders(request.headers),
    redirect: "manual",
    cache: "no-store"
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}
