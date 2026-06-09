import { NextResponse } from "next/server";
import { matchFields, type FieldMatchInput } from "@jobposted/field-match";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Internal field-matching endpoint (design doc §11.2) for the Chrome extension — returns a field
 * map (DATA, never code, MV3-safe). Service-token authed. The server worker imports the package
 * directly and does not use this route.
 */
export async function POST(request: Request) {
  const token = process.env.FIELD_MATCH_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }
  if (request.headers.get("x-service-token") !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: FieldMatchInput;
  try {
    input = (await request.json()) as FieldMatchInput;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!input?.fields || !input?.profile) {
    return NextResponse.json({ error: "Missing fields or profile" }, { status: 400 });
  }

  const fieldMap = await matchFields(input);
  return NextResponse.json(fieldMap);
}
