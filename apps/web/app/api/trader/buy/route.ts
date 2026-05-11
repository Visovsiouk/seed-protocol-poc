import {
  buyBodySchema,
  doTraderBuy,
  withTraderGuards,
} from "@/lib/trader-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withTraderGuards(buyBodySchema, doTraderBuy);
