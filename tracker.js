// tracker.js
// Orchestrates the Stonkers pipeline: pulls mentions, scores sentiment,
// checks for spikes, and (optionally) correlates against price history.
//
// Right now `fetchMentions` and `fetchPriceHistory` return mock data so
// the whole pipeline is runnable and testable without live API keys.
// Swap them out for real Reddit/X/Discord + price-feed calls later —
// the rest of the pipeline doesn't need to change.

const { aggregateSentiment } = require("./sentiment");
const { detectSpike } = require("./spike-detector");
const { correlateSentimentToPrice } = require("./backtest");

// ---------------------------------------------------------------------
// Mock data sources (replace with real API calls)
// ---------------------------------------------------------------------

const SAMPLE_POSTS = [
  "SOL looking bullish, might send it to the moon this week",
  "just bought more SOL, diamond hands baby",
  "SOL dumping hard, this is a rug",
  "not sure about SOL, feels like a bagholder situation",
  "SOL breakout incoming, long from here",
  "sold my SOL, going short",
  "SOL green candles all day, pump it",
  "SOL red again, paper hands are fine, I'm holding",
];

function fetchMentions(ticker, bucketCount = 10) {
  // Simulates hourly buckets of mention counts + sample text.
  // A real implementation would query Reddit/X/Discord APIs here
  // and bucket results by timestamp.
  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const count = Math.floor(Math.random() * 15) + 5;
    const posts = Array.from({ length: count }, () => ({
      text: SAMPLE_POSTS[Math.floor(Math.random() * SAMPLE_POSTS.length)],
      timestamp: Date.now() - (bucketCount - i) * 3600 * 1000,
    }));
    buckets.push(posts);
  }
  // Last bucket gets an artificial spike so detectSpike has something to catch
  const spikeCount = 40;
  buckets[buckets.length - 1] = Array.from({ length: spikeCount }, () => ({
    text: SAMPLE_POSTS[Math.floor(Math.random() * SAMPLE_POSTS.length)],
    timestamp: Date.now(),
  }));
  return buckets;
}

function fetchPriceHistory(ticker, bucketCount = 10) {
  // Simulates hourly price points. Replace with a real price feed
  // (e.g. CoinGecko, an exchange API, or a stock data provider).
  const prices = [];
  let price = 100;
  for (let i = 0; i < bucketCount; i++) {
    price += (Math.random() - 0.45) * 3;
    prices.push({
      timestamp: Date.now() - (bucketCount - i) * 3600 * 1000,
      price: Number(price.toFixed(2)),
    });
  }
  return prices;
}

// ---------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------

function runPipeline(ticker) {
  const mentionBuckets = fetchMentions(ticker);
  const priceHistory = fetchPriceHistory(ticker);

  // 1. Sentiment per bucket
  const sentimentSeries = mentionBuckets.map((posts, i) => {
    const agg = aggregateSentiment(ticker, posts);
    return {
      timestamp: priceHistory[i].timestamp,
      mentionCount: agg.mentionCount,
      sentiment: agg.avgSentiment,
    };
  });

  // 2. Spike detection on mention counts
  const mentionCounts = sentimentSeries.map(s => s.mentionCount);
  const spikeResult = detectSpike(mentionCounts);

  // 3. Backtest: does sentiment lead price?
  const backtestResult = correlateSentimentToPrice(
    sentimentSeries.map(s => ({ timestamp: s.timestamp, sentiment: s.sentiment })),
    priceHistory
  );

  return {
    ticker,
    sentimentSeries,
    spike: spikeResult,
    correlation: backtestResult.correlation,
  };
}

// ---------------------------------------------------------------------
// CLI runner — `node tracker.js SOL`
// ---------------------------------------------------------------------

if (require.main === module) {
  const ticker = process.argv[2] || "SOL";
  const result = runPipeline(ticker);

  console.log(`\nStonkers report for $${result.ticker}\n`);
  console.log("Sentiment by bucket:");
  result.sentimentSeries.forEach((s, i) => {
    console.log(
      `  bucket ${i}: ${s.mentionCount} mentions, sentiment ${s.sentiment}`
    );
  });

  console.log("\nSpike check:");
  console.log(
    `  ${result.spike.isSpike ? "SPIKE DETECTED" : "no spike"} ` +
    `(z-score: ${result.spike.zScore ?? "n/a"})`
  );

  console.log("\nSentiment-to-price correlation:");
  console.log(`  r = ${result.correlation}`);
}

module.exports = { runPipeline, fetchMentions, fetchPriceHistory };
