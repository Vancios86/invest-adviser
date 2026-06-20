-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnalysisReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "holdingId" TEXT,
    "recommendation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "agentOutputs" TEXT NOT NULL,
    "analysisMode" TEXT NOT NULL DEFAULT 'rules',
    "llmModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisReport_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AnalysisReport" ("agentOutputs", "confidence", "createdAt", "executiveSummary", "holdingId", "id", "recommendation", "symbol") SELECT "agentOutputs", "confidence", "createdAt", "executiveSummary", "holdingId", "id", "recommendation", "symbol" FROM "AnalysisReport";
DROP TABLE "AnalysisReport";
ALTER TABLE "new_AnalysisReport" RENAME TO "AnalysisReport";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
