import {
  cancelBodySchema,
  doTraderCancel,
  withTraderGuards,
} from "@/lib/trader-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withTraderGuards(cancelBodySchema, doTraderCancel);
