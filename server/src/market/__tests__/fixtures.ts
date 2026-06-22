/** Static fixtures captured from the real free sources, trimmed for tests. */

export const STOOQ_HISTORY_CSV = `Date,Open,High,Low,Close,Volume
2024-06-17,100.0,102.5,99.5,101.0,1000000
2024-06-18,101.0,103.0,100.5,102.5,1100000
2024-06-19,102.5,104.0,102.0,103.5,900000
2024-06-20,103.5,105.0,103.0,104.0,1200000
2024-06-21,104.0,106.0,103.5,105.5,1300000
`;

/** Includes a malformed row (missing close) and a junk row to prove resilience. */
export const STOOQ_HISTORY_CSV_DIRTY = `Date,Open,High,Low,Close,Volume
2024-06-17,100.0,102.5,99.5,101.0,1000000
2024-06-18,101.0,103.0,100.5,,1100000
garbage line that is not data
2024-06-19,102.5,104.0,102.0,103.5,900000
`;

export const STOOQ_EMPTY_CSV = `Date,Open,High,Low,Close,Volume
`;

export const YAHOO_CHART_JSON = JSON.stringify({
  chart: {
    result: [
      {
        timestamp: [1718582400, 1718668800, 1718755200],
        indicators: {
          quote: [
            {
              open: [200, 201, 202],
              high: [205, 206, 207],
              low: [199, 200, 201],
              close: [204, 205, 206],
              volume: [500000, 510000, 520000],
            },
          ],
          adjclose: [{ adjclose: [203.5, 204.5, 205.5] }],
        },
      },
    ],
    error: null,
  },
});

export const YAHOO_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Yahoo Finance</title>
    <item>
      <title>AAPL hits new high on strong demand</title>
      <link>https://finance.yahoo.com/news/aapl-high-1</link>
      <pubDate>Fri, 21 Jun 2024 13:00:00 GMT</pubDate>
      <description>Shares rose after upbeat guidance.</description>
      <guid>https://finance.yahoo.com/news/aapl-high-1</guid>
    </item>
    <item>
      <title>Analyst raises AAPL price target</title>
      <link>https://finance.yahoo.com/news/aapl-target-2</link>
      <pubDate>Thu, 20 Jun 2024 09:30:00 GMT</pubDate>
      <description>Target lifted to 250.</description>
      <guid>https://finance.yahoo.com/news/aapl-target-2</guid>
    </item>
  </channel>
</rss>`;

export const SEC_EDGAR_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>8-K filings</title>
  <entry>
    <title>8-K - Current report</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/320193/000032019324000081.htm"/>
    <updated>2024-06-19T16:30:00-04:00</updated>
    <summary>Material event disclosure.</summary>
  </entry>
</feed>`;
