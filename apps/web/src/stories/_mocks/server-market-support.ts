/** Mock for @/server/market-support, so pages that read it bundle without the database. */
import { selfHostedMarketSupport } from "./market-support";

export const getMarketSupportFn = async () => selfHostedMarketSupport;
