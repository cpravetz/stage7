#!/usr/bin/env python3
"""
MARKET_DATA Plugin - Market data access and analysis
Provides historical price data, real-time quotes, trend analysis, and technical indicators
"""

import sys
import json
import logging
import os
import math
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {{'value':...}} wrapper."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def _validate_ticker(ticker: str) -> str:
    """Validate and normalize ticker symbol."""
    if not ticker:
        raise ValueError("Ticker symbol is required")
    return str(ticker).upper().strip()

def _validate_period(period: str) -> str:
    """Validate period parameter."""
    valid_periods = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    if period not in valid_periods:
        logger.warning(f"Invalid period {period}, defaulting to 1y")
        return '1y'
    return period

def get_historical_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Retrieve historical price data for a security."""
    try:
        ticker = _validate_ticker(payload.get('ticker', ''))
        period = _validate_period(payload.get('period', '1y'))
        interval = payload.get('interval', '1d')
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        logger.info(f"Fetching historical data for {ticker} with period {period}")
        
        data = yf.download(ticker, period=period, interval=interval, progress=False)
        
        if data.empty:
            raise ValueError(f"No data retrieved for {ticker}")
        
        # Prepare data
        historical_records = []
        for idx, row in data.iterrows():
            historical_records.append({
                'date': idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume']) if 'Volume' in row else 0
            })
        
        # Calculate statistics
        closes = data['Close'].values
        returns = pd.Series(closes).pct_change().dropna()
        
        stats = {
            'ticker': ticker,
            'period': period,
            'interval': interval,
            'data_points': len(historical_records),
            'date_range': {
                'start': historical_records[0]['date'] if historical_records else None,
                'end': historical_records[-1]['date'] if historical_records else None
            },
            'price_stats': {
                'current_price': round(closes[-1], 2),
                'min_price': round(min(closes), 2),
                'max_price': round(max(closes), 2),
                'avg_price': round(np.mean(closes), 2),
                'price_change_pct': round(((closes[-1] / closes[0]) - 1) * 100, 2)
            },
            'volatility': {
                'daily_volatility_pct': round(returns.std() * 100, 2),
                'annualized_volatility_pct': round(returns.std() * math.sqrt(252) * 100, 2)
            }
        }
        
        return {
            'success': True,
            'statistics': stats,
            'data': historical_records[-100:],  # Return last 100 records
            'total_records': len(historical_records)
        }
    
    except Exception as e:
        logger.error(f"Error in get_historical_data: {str(e)}")
        return {'success': False, 'error': str(e)}

def get_quote(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get real-time or latest quote for a security."""
    try:
        ticker = _validate_ticker(payload.get('ticker', ''))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        logger.info(f"Fetching quote for {ticker}")
        
        stock = yf.Ticker(ticker)
        hist = stock.history(period='5d', progress=False)
        
        if hist.empty:
            raise ValueError(f"No data available for {ticker}")
        
        info = stock.info
        current_price = hist['Close'].iloc[-1]
        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        
        price_change = current_price - prev_close
        price_change_pct = (price_change / prev_close * 100) if prev_close > 0 else 0
        
        # 52-week stats
        hist_1y = stock.history(period='1y', progress=False)
        week_52_high = hist_1y['High'].max() if not hist_1y.empty else current_price
        week_52_low = hist_1y['Low'].min() if not hist_1y.empty else current_price
        
        quote = {
            'ticker': ticker,
            'company_name': info.get('longName', ticker),
            'current_price': round(current_price, 2),
            'previous_close': round(prev_close, 2),
            'price_change': round(price_change, 2),
            'price_change_pct': round(price_change_pct, 2),
            'day_high': round(hist['High'].iloc[-1], 2),
            'day_low': round(hist['Low'].iloc[-1], 2),
            'week_52_high': round(week_52_high, 2),
            'week_52_low': round(week_52_low, 2),
            'market_cap': info.get('marketCap', 'N/A'),
            'pe_ratio': round(info.get('trailingPE', 0), 2) if info.get('trailingPE') else 'N/A',
            'dividend_yield': round(info.get('dividendYield', 0) * 100, 2) if info.get('dividendYield') else 'N/A',
            'beta': round(info.get('beta', 0), 2) if info.get('beta') else 'N/A',
            'sector': info.get('sector', 'N/A'),
            'industry': info.get('industry', 'N/A'),
            'timestamp': datetime.now().isoformat()
        }
        
        return {'success': True, 'quote': quote}
    
    except Exception as e:
        logger.error(f"Error in get_quote: {str(e)}")
        return {'success': False, 'error': str(e)}

def analyze_trends(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze price trends and momentum."""
    try:
        ticker = _validate_ticker(payload.get('ticker', ''))
        period = _validate_period(payload.get('period', '1y'))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        logger.info(f"Analyzing trends for {ticker}")
        
        data = yf.download(ticker, period=period, progress=False)
        
        if data.empty:
            raise ValueError(f"No data for {ticker}")
        
        closes = data['Close'].values
        
        # Trend analysis
        if len(closes) >= 2:
            recent_trend = 'UPTREND' if closes[-1] > closes[-2] else 'DOWNTREND'
        else:
            recent_trend = 'INSUFFICIENT_DATA'
        
        # Linear regression slope for overall trend
        x = np.arange(len(closes))
        z = np.polyfit(x, closes, 1)
        slope = z[0]
        trend_strength = 'STRONG' if abs(slope) > (np.std(closes) * 0.01) else 'WEAK'
        
        # Moving averages
        ma_10 = pd.Series(closes).rolling(window=10).mean().iloc[-1] if len(closes) >= 10 else None
        ma_50 = pd.Series(closes).rolling(window=50).mean().iloc[-1] if len(closes) >= 50 else None
        ma_200 = pd.Series(closes).rolling(window=200).mean().iloc[-1] if len(closes) >= 200 else None
        
        # Price relative to moving averages
        current = closes[-1]
        trend_signals = []
        
        if ma_10 and current > ma_10:
            trend_signals.append('BULLISH: Price above 10-day MA')
        if ma_50 and current > ma_50:
            trend_signals.append('BULLISH: Price above 50-day MA')
        if ma_200 and current > ma_200:
            trend_signals.append('BULLISH: Price above 200-day MA')
        
        # Price momentum
        momentum_1m = ((closes[-1] / closes[-20]) - 1) * 100 if len(closes) >= 20 else 0
        momentum_3m = ((closes[-1] / closes[-60]) - 1) * 100 if len(closes) >= 60 else 0
        momentum_1y = ((closes[-1] / closes[0]) - 1) * 100
        
        return {
            'success': True,
            'ticker': ticker,
            'trend_analysis': {
                'recent_trend': recent_trend,
                'trend_strength': trend_strength,
                'slope': round(slope, 6)
            },
            'moving_averages': {
                'ma_10': round(ma_10, 2) if ma_10 else None,
                'ma_50': round(ma_50, 2) if ma_50 else None,
                'ma_200': round(ma_200, 2) if ma_200 else None
            },
            'price_to_ma': {
                'price_to_ma10': round((current / ma_10 - 1) * 100, 2) if ma_10 else None,
                'price_to_ma50': round((current / ma_50 - 1) * 100, 2) if ma_50 else None,
                'price_to_ma200': round((current / ma_200 - 1) * 100, 2) if ma_200 else None
            },
            'momentum': {
                'momentum_1m_pct': round(momentum_1m, 2) if len(closes) >= 20 else None,
                'momentum_3m_pct': round(momentum_3m, 2) if len(closes) >= 60 else None,
                'momentum_1y_pct': round(momentum_1y, 2)
            },
            'trend_signals': trend_signals
        }
    
    except Exception as e:
        logger.error(f"Error in analyze_trends: {str(e)}")
        return {'success': False, 'error': str(e)}

def calculate_indicators(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate technical indicators."""
    try:
        ticker = _validate_ticker(payload.get('ticker', ''))
        period = _validate_period(payload.get('period', '1y'))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        logger.info(f"Calculating indicators for {ticker}")
        
        data = yf.download(ticker, period=period, progress=False)
        
        if data.empty:
            raise ValueError(f"No data for {ticker}")
        
        closes = data['Close'].values
        highs = data['High'].values
        lows = data['Low'].values
        volumes = data['Volume'].values if 'Volume' in data else []
        
        # RSI (Relative Strength Index)
        def calculate_rsi(prices, period=14):
            deltas = np.diff(prices)
            seed = deltas[:period + 1]
            up = seed[seed >= 0].sum() / period
            down = -seed[seed < 0].sum() / period
            rs = up / down if down > 0 else 0
            rsi = 100 - (100 / (1 + rs))
            return rsi
        
        rsi = calculate_rsi(closes) if len(closes) >= 14 else None
        
        # MACD (Moving Average Convergence Divergence)
        ema_12 = pd.Series(closes).ewm(span=12).mean().iloc[-1] if len(closes) >= 12 else None
        ema_26 = pd.Series(closes).ewm(span=26).mean().iloc[-1] if len(closes) >= 26 else None
        macd = (ema_12 - ema_26) if (ema_12 and ema_26) else None
        
        # Bollinger Bands
        sma_20 = pd.Series(closes).rolling(window=20).mean().iloc[-1] if len(closes) >= 20 else None
        std_20 = pd.Series(closes).rolling(window=20).std().iloc[-1] if len(closes) >= 20 else None
        
        upper_band = (sma_20 + (std_20 * 2)) if (sma_20 and std_20) else None
        lower_band = (sma_20 - (std_20 * 2)) if (sma_20 and std_20) else None
        
        # Stochastic Oscillator
        def calculate_stochastic(highs, lows, closes, period=14):
            low_min = pd.Series(lows).rolling(window=period).min().iloc[-1] if len(lows) >= period else min(lows)
            high_max = pd.Series(highs).rolling(window=period).max().iloc[-1] if len(highs) >= period else max(highs)
            k_percent = ((closes[-1] - low_min) / (high_max - low_min) * 100) if (high_max - low_min) > 0 else 0
            return k_percent
        
        stoch = calculate_stochastic(highs, lows, closes) if len(closes) >= 14 else None
        
        indicators = {
            'rsi': round(rsi, 2) if rsi else None,
            'macd': round(macd, 4) if macd else None,
            'bollinger_bands': {
                'upper': round(upper_band, 2) if upper_band else None,
                'middle': round(sma_20, 2) if sma_20 else None,
                'lower': round(lower_band, 2) if lower_band else None
            },
            'stochastic': round(stoch, 2) if stoch else None
        }
        
        # Generate signals
        signals = []
        if rsi and rsi < 30:
            signals.append('OVERSOLD: RSI < 30')
        elif rsi and rsi > 70:
            signals.append('OVERBOUGHT: RSI > 70')
        
        if upper_band and closes[-1] > upper_band:
            signals.append('Price above upper Bollinger Band - potential correction')
        if lower_band and closes[-1] < lower_band:
            signals.append('Price below lower Bollinger Band - potential bounce')
        
        return {
            'success': True,
            'ticker': ticker,
            'indicators': indicators,
            'signals': signals
        }
    
    except Exception as e:
        logger.error(f"Error in calculate_indicators: {str(e)}")
        return {'success': False, 'error': str(e)}

def analyze_volume(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze trading volume and patterns."""
    try:
        ticker = _validate_ticker(payload.get('ticker', ''))
        period = _validate_period(payload.get('period', '1y'))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        logger.info(f"Analyzing volume for {ticker}")
        
        data = yf.download(ticker, period=period, progress=False)
        
        if data.empty or 'Volume' not in data.columns:
            raise ValueError(f"No volume data for {ticker}")
        
        volumes = data['Volume'].values
        closes = data['Close'].values
        
        # Volume statistics
        avg_volume = np.mean(volumes)
        current_volume = volumes[-1]
        volume_change_pct = ((current_volume / avg_volume) - 1) * 100 if avg_volume > 0 else 0
        
        # Volume trend
        vol_ma_20 = pd.Series(volumes).rolling(window=20).mean().iloc[-1] if len(volumes) >= 20 else avg_volume
        
        volume_trend = 'INCREASING' if current_volume > vol_ma_20 else 'DECREASING'
        
        # On-Balance Volume
        obv = 0
        for i in range(len(closes)):
            if closes[i] > (closes[i-1] if i > 0 else closes[i]):
                obv += volumes[i]
            elif closes[i] < (closes[i-1] if i > 0 else closes[i]):
                obv -= volumes[i]
        
        # Volume rate of change
        if len(volumes) >= 12:
            vrc = ((volumes[-1] / volumes[-12]) - 1) * 100
        else:
            vrc = 0
        
        return {
            'success': True,
            'ticker': ticker,
            'volume_analysis': {
                'current_volume': int(current_volume),
                'average_volume': int(avg_volume),
                'volume_change_pct': round(volume_change_pct, 2),
                'volume_trend': volume_trend,
                'volume_ma_20': int(vol_ma_20),
                'volume_rate_of_change_pct': round(vrc, 2)
            },
            'obv': int(obv),
            'volume_interpretation': 'High volume confirms price move' if abs(volume_change_pct) > 30 else 'Normal volume levels'
        }
    
    except Exception as e:
        logger.error(f"Error in analyze_volume: {str(e)}")
        return {'success': False, 'error': str(e)}

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action}")

        # Action dispatch
        actions = {
            'get_historical_data': get_historical_data,
            'get_quote': get_quote,
            'analyze_trends': analyze_trends,
            'calculate_indicators': calculate_indicators,
            'analyze_volume': analyze_volume
        }

        if action not in actions:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        result = actions[action](payload)

        return [{
            "success": result.get('success', False),
            "name": "result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
