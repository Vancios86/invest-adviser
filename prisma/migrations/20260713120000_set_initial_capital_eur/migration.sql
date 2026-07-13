-- Set starting capital for portfolios that still have zero cash balances.
UPDATE "PortfolioSettings"
SET "cashEur" = 60000
WHERE "id" = 'default' AND "cashEur" = 0 AND "cashUsd" = 0;
