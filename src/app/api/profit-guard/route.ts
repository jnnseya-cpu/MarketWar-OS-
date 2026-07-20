import { NextRequest, NextResponse } from "next/server";
import {
  preScaleCheck,
  demoProfitGuard,
  CHECKS,
  type PreScaleInput,
} from "@/backend/profit-guard";

const DOCTRINE =
  "ProfitGuard AI (VideoDominance Gap 11): pre-scale safety + profitability gate. Before a high-performing clip scales spend or reach, all nine checks must pass — a viral clip must NOT scale a low-margin or out-of-stock product. Outputs are deterministic ESTIMATES from supplied data; margin must clear the profit floor.";

interface RequestBody {
  action?: string;
  input?: PreScaleInput;
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
      const input = body.input as PreScaleInput | undefined;
      if (!input || typeof input !== "object") {
        return NextResponse.json(
          { error: "Missing required input (object)" },
          { status: 400 },
        );
      }
      return NextResponse.json(preScaleCheck(input));
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
    checks: CHECKS,
    demo: demoProfitGuard(),
  });
}
