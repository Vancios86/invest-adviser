export function getQuoteSymbol(holding: {
  symbol: string;
  quoteSymbol?: string | null;
}): string {
  return (holding.quoteSymbol ?? holding.symbol).trim().toUpperCase();
}
