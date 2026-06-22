/**
 * Start the HTTP API the mobile client talks to.
 *
 * Usage: npm run api            # PORT env or 8787
 *
 * Serves /api/picks/today, /api/quotes, /api/scorecard, /api/health backed by the
 * disk-persisted stores (run `npm run batch:daily` to populate today's picks).
 */

import { startApiServer } from "../api/server.js";

startApiServer();
