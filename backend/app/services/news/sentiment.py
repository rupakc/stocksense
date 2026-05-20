from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Company name → ticker mappings for symbol extraction (all exchanges)
COMPANY_SYMBOL_MAP = {
    # ── Indian (NSE) ──
    "reliance": "RELIANCE.NS",
    "tcs": "TCS.NS",
    "infosys": "INFY.NS",
    "infy": "INFY.NS",
    "hdfc bank": "HDFCBANK.NS",
    "hdfcbank": "HDFCBANK.NS",
    "icici bank": "ICICIBANK.NS",
    "icicibank": "ICICIBANK.NS",
    "state bank": "SBIN.NS",
    "sbi": "SBIN.NS",
    "wipro": "WIPRO.NS",
    "bajaj": "BAJFINANCE.NS",
    "bharti airtel": "BHARTIARTL.NS",
    "airtel": "BHARTIARTL.NS",
    "itc": "ITC.NS",
    "hindustan unilever": "HINDUNILVR.NS",
    "hul": "HINDUNILVR.NS",
    "kotak": "KOTAKBANK.NS",
    "maruti": "MARUTI.NS",
    "sun pharma": "SUNPHARMA.NS",
    "titan": "TITAN.NS",
    "asian paints": "ASIANPAINT.NS",
    "l&t": "LT.NS",
    "larsen": "LT.NS",
    "ultratech": "ULTRACEMCO.NS",
    "axis bank": "AXISBANK.NS",
    "tech mahindra": "TECHM.NS",
    "ongc": "ONGC.NS",
    "ntpc": "NTPC.NS",
    "power grid": "POWERGRID.NS",
    # ── US (NASDAQ/NYSE) ──
    "apple": "AAPL",
    "microsoft": "MSFT",
    "google": "GOOGL",
    "alphabet": "GOOGL",
    "amazon": "AMZN",
    "nvidia": "NVDA",
    "meta": "META",
    "facebook": "META",
    "tesla": "TSLA",
    "jpmorgan": "JPM",
    "visa": "V",
    "mastercard": "MA",
    "netflix": "NFLX",
    "adobe": "ADBE",
    "salesforce": "CRM",
    "amd": "AMD",
    "intel": "INTC",
    "cisco": "CSCO",
    "walmart": "WMT",
    "disney": "DIS",
    "boeing": "BA",
    "nike": "NKE",
    "paypal": "PYPL",
    "qualcomm": "QCOM",
    "oracle": "ORCL",
    "ibm": "IBM",
    "goldman sachs": "GS",
    "uber": "UBER",
    "shopify": "SHOP",
    "palantir": "PLTR",
    "coinbase": "COIN",
    "airbnb": "ABNB",
    "spotify": "SPOT",
}


class SentimentAnalyzer:
    def __init__(self):
        self._vader = SentimentIntensityAnalyzer()
        # Augment VADER with finance-specific lexicon
        finance_lexicon = {
            "bullish": 2.0,
            "bearish": -2.0,
            "rally": 1.5,
            "plunge": -1.5,
            "surge": 1.5,
            "crash": -2.0,
            "downgrade": -1.5,
            "upgrade": 1.5,
            "beat": 1.0,
            "miss": -1.0,
            "profit": 1.2,
            "loss": -1.2,
            "record high": 2.0,
            "record low": -2.0,
            "buyback": 1.0,
            "dividend": 0.8,
            "default": -2.5,
            "fraud": -2.5,
            "scam": -2.5,
        }
        self._vader.lexicon.update(finance_lexicon)

    def analyze(self, text: str) -> dict:
        scores = self._vader.polarity_scores(text)
        return {
            "sentiment_compound": round(scores["compound"], 4),
            "sentiment_positive": round(scores["pos"], 4),
            "sentiment_negative": round(scores["neg"], 4),
            "sentiment_neutral": round(scores["neu"], 4),
        }

    def extract_symbols(self, text: str) -> list[str]:
        text_lower = text.lower()
        found = []
        for keyword, symbol in COMPANY_SYMBOL_MAP.items():
            if keyword in text_lower and symbol not in found:
                found.append(symbol)
        return found
