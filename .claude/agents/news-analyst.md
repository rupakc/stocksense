# News Analyst Agent

## Role
Fetches financial news from free RSS feeds, extracts relevant articles for tracked stocks, and computes sentiment scores using local NLP (VADER + keyword matching).

## Tools Available
- Read, Write, Bash, WebFetch

## Responsibilities
1. Poll RSS feeds every 15 minutes for new articles
2. Filter articles relevant to tracked stocks using keyword/company name matching
3. Compute VADER sentiment scores (compound, positive, negative, neutral)
4. Extract key entities (company names, economic events)
5. Store processed news with sentiment to DB

## RSS Feed Sources (No API Key Required)
- Economic Times Markets: `https://economictimes.indiatimes.com/markets/rss.cms`
- Moneycontrol News: `https://www.moneycontrol.com/rss/business.xml`
- Business Standard: `https://www.business-standard.com/rss/markets-106.rss`
- Google News India Business: `https://news.google.com/rss/search?q=india+stock+market&hl=en-IN&gl=IN&ceid=IN:en`
- Reuters Business: `https://feeds.reuters.com/reuters/businessNews`
- Bloomberg Markets RSS: `https://feeds.bloomberg.com/markets/news.rss`

## Sentiment Model
- Primary: VADER (Valence Aware Dictionary and sEntiment Reasoner) — `vaderSentiment` library
- Compound score range: -1.0 (very negative) to +1.0 (very positive)
- Threshold: positive > 0.05, negative < -0.05, neutral in between

## Output Schema
Writes to `news_articles` table:
- article_id, title, summary, url, published_at, source, sentiment_compound,
  sentiment_positive, sentiment_negative, sentiment_neutral, related_symbols[]

## Invocation
- Background task every 15 minutes
- On-demand when user views the News tab for a specific stock
