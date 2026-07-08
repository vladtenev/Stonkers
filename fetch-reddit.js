// fetch-reddit.js
// Pulls real mentions of a ticker from Reddit's public search JSON
// endpoint. No API key needed for read-only public search, but Reddit
// rate-limits unauthenticated requests, so keep polling infrequent
// (e.g. once every few minutes per ticker) and cache results.
//   const { fetchRedditMentions } = require("./fetch-reddit");

const REDDIT_SEARCH_URL = "https://www.reddit.com/search.json";

/**
 * Fetches recent Reddit posts mentioning a ticker.
 * @param {string} ticker - e.g. "SOL"
 * @param {object} opts
 * @param {number} opts.limit - max posts to fetch (Reddit caps at 100)
 * @param {string} opts.sort - "new" | "relevance" | "top"
 * @param {string} opts.timeframe - "hour" | "day" | "week"
 */
async function fetchRedditMentions(ticker, opts = {}) {
  const { limit = 50, sort = "new", timeframe = "day" } = opts;

  const params = new URLSearchParams({
    q: `"$${ticker}" OR "${ticker}"`,
    sort,
    t: timeframe,
    limit: String(limit),
    raw_json: "1",
  });

  const url = `${REDDIT_SEARCH_URL}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      // Reddit requires a descriptive User-Agent or it may 429 you
      "User-Agent": "stonkers-sentiment-tracker/0.1 (by u/your_username)",
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const posts = data?.data?.children ?? [];

  return posts.map(({ data: post }) => ({
    text: `${post.title} ${post.selftext || ""}`.trim(),
    timestamp: post.created_utc * 1000,
    url: `https://reddit.com${post.permalink}`,
    subreddit: post.subreddit,
    score: post.score,
  }));
}

/**
 * Buckets a flat list of posts into hourly windows, matching the
 * shape tracker.js expects (an array of post-arrays, oldest first).
 */
function bucketByHour(posts, bucketCount = 10) {
  const now = Date.now();
  const bucketMs = 3600 * 1000;
  const buckets = Array.from({ length: bucketCount }, () => []);

  for (const post of posts) {
    const age = now - post.timestamp;
    const bucketIndex = bucketCount - 1 - Math.floor(age / bucketMs);
    if (bucketIndex >= 0 && bucketIndex < bucketCount) {
      buckets[bucketIndex].push(post);
    }
  }

  return buckets;
}

// ---------------------------------------------------------------------
// CLI runner — `node fetch-reddit.js SOL`
// ---------------------------------------------------------------------

if (require.main === module) {
  const ticker = process.argv[2] || "SOL";

  fetchRedditMentions(ticker)
    .then(posts => {
      console.log(`Found ${posts.length} mentions of $${ticker} on Reddit\n`);
      posts.slice(0, 5).forEach(p => {
        console.log(`  [${p.subreddit}] ${p.text.slice(0, 80)}...`);
      });
    })
    .catch(err => {
      console.error("Error fetching Reddit mentions:", err.message);
    });
}

module.exports = { fetchRedditMentions, bucketByHour };
