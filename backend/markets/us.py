import re
import time
from datetime import timedelta

import pandas as pd
import requests
import yfinance as yf

BENCHMARK_TICKER = "^GSPC"
CONCURRENCY = 10
EXPECTED_STOCK_COUNT = 700


def _strip_tags(html: str) -> str:
    return re.sub(r'<[^>]+>', '', html).strip()


def _compute_roi(prices, divs_sum):
    if prices is None or len(prices) < 2:
        return None
    return (float(prices.iloc[-1]) - float(prices.iloc[0]) + float(divs_sum)) / float(prices.iloc[0]) * 100


def _parse_cap_usd(s: str):
    s = s.replace("$", "").replace(",", "").strip()
    if s.endswith(" T"):
        return float(s[:-2]) * 1000
    if s.endswith(" B"):
        return float(s[:-2])
    return None


def _fetch_top700():
    base = "https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; roi-tracker/1.0)"}
    stocks = []
    for page in range(1, 8):    # pages 1–7 = 700 stocks
        try:
            r = requests.get(base, params={"page": page}, headers=headers, timeout=30)
            r.encoding = "utf-8"
            for row in re.findall(r'<tr[^>]*>(.*?)</tr>', r.text, re.DOTALL):
                cells = [_strip_tags(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)]
                if len(cells) < 4 or not cells[1].isdigit():
                    continue
                name_m = re.search(r'<div class="company-name">(.*?)</div>', row)
                code_m = re.search(r'<div class="company-code">(.*?)</div>', row, re.DOTALL)
                if not name_m or not code_m:
                    continue
                name = name_m.group(1).strip()
                code = _strip_tags(code_m.group(1)).strip()
                try:
                    cap_b = _parse_cap_usd(cells[3])
                except (ValueError, IndexError):
                    cap_b = None
                stocks.append({
                    "rank":       int(cells[1]),
                    "name":       name,
                    "code":       code,
                    "market_cap": cap_b,
                    "industry":   "",
                })
        except Exception:
            pass
        time.sleep(1)
    return stocks


def scrape():
    return _fetch_top700()


def fetch_stock(stock, now_utc):
    """Return (roi_1y, roi_5y, sector) for a US stock."""
    ticker_str = stock["code"]
    try:
        obj = yf.Ticker(ticker_str)
        sector = obj.info.get("sector") or ""

        hist = obj.history(period="5y", auto_adjust=True)
        if hist.empty:
            return None, None, sector
        prices = hist["Close"].dropna()
        if len(prices) < 2:
            return None, None, sector

        p_tz = prices.index.tz
        cutoff_1y = pd.Timestamp(now_utc - timedelta(days=365)).tz_convert(p_tz)
        cutoff_5y = pd.Timestamp(now_utc - timedelta(days=365 * 5)).tz_convert(p_tz)

        p1y = prices[prices.index >= cutoff_1y]
        p5y = prices[prices.index >= cutoff_5y]

        return _compute_roi(p1y, 0), _compute_roi(p5y, 0), sector
    except Exception:
        return None, None, ""
