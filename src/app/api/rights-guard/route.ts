import { NextRequest, NextResponse } from "next/server";
import {
  checkRights,
  demoRightsGuard,
  RIGHTS_FIELDS,
  type CheckRightsInput,
} from "@/backend/rights-guard";

const DOCTRINE =
  "RightsGuard (VideoDominance Gap 12): content rights & consent matrix. Publishing is BLOCKED whenever any required right for the intended use is missing. Never assume consent — only affirmative, documented rights clear an asset. Outputs are deterministic ESTIMATES, not legal advice.";

interface RequestBody {
  action?: string;
  input?: CheckRightsInput;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "check": {
      const input = body.input as CheckRightsInput | undefined;
      if (!input || typeof input.assetId !== "string" || input.assetId.length === 0) {
        return NextResponse.json(
          { error: "Missing required input.assetId (string)" },
          { status: 400 },
        );
      }
      return NextResponse.json(checkRights(input));
    }
    default:
      return NextResponse.json(
        { error: "Unknown action; expected 'check'" },
        { status: 400 },
      );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    doctrine: DOCTRINE,
    rightsFields: RIGHTS_FIELDS,
    demo: demoRightsGuard(),
  });
}
