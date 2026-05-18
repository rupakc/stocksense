import pytest
from app.services.market_data.nse_fetcher import NSEFetcher


def test_fetch_history_returns_dataframe():
    fetcher = NSEFetcher()
    df = fetcher.fetch_history("RELIANCE.NS", period="1mo")
    assert not df.empty
    assert "close" in df.columns
    assert "symbol" in df.columns
    assert (df["symbol"] == "RELIANCE.NS").all()


def test_get_live_quote():
    fetcher = NSEFetcher()
    quote = fetcher.get_live_quote("TCS.NS")
    assert quote is not None
    assert quote["current_price"] > 0


def test_sentiment_analyzer():
    from app.services.news.sentiment import SentimentAnalyzer
    analyzer = SentimentAnalyzer()
    scores = analyzer.analyze("Reliance Industries posts record profits, stock surges 5%")
    assert scores["sentiment_compound"] > 0

    scores_neg = analyzer.analyze("Market crash wipes out billions, bearish outlook")
    assert scores_neg["sentiment_compound"] < 0
