#!/usr/bin/env python3
"""
FINANCIAL_ANALYSIS Plugin - Financial analysis and modeling
Performs portfolio performance analysis, risk assessment, return analysis, and asset allocation analysis
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

def _validate_tickers(tickers: List[str]) -> List[str]:
    """Validate and normalize ticker symbols."""
    if not tickers:
        raise ValueError("At least one ticker symbol is required")
    if not isinstance(tickers, list):
        tickers = [tickers]
    return [str(t).upper().strip() for t in tickers if t]

def _validate_weights(weights: List[float], tickers: List[str]) -> List[float]:
    """Validate portfolio weights sum to 1.0."""
    if not weights:
        return [1.0 / len(tickers) for _ in tickers]
    if len(weights) != len(tickers):
        raise ValueError(f"Number of weights ({len(weights)}) must match number of tickers ({len(tickers)})")
    weights = [float(w) for w in weights]
    weight_sum = sum(weights)
    if abs(weight_sum - 1.0) > 0.01:
        logger.warning(f"Weights sum to {weight_sum}, normalizing to 1.0")
        weights = [w / weight_sum for w in weights]
    return weights

def analyze_portfolio(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze portfolio performance with multiple metrics."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        weights = _validate_weights(payload.get('weights'), tickers)
        period = payload.get('period', '1y')
        
        if not HAS_YFINANCE:
            return {
                'success': False,
                'error': 'yfinance not installed. Install with: pip install yfinance pandas numpy'
            }
        
        # Fetch historical data
        logger.info(f"Fetching data for {tickers} with period {period}")
        data = yf.download(' '.join(tickers), period=period, progress=False)
        
        if data.empty:
            raise ValueError(f"No data retrieved for tickers: {tickers}")
        
        # Ensure we have closing prices
        if len(tickers) == 1:
            close_prices = data['Close']
        else:
            close_prices = data['Close']
        
        # Calculate returns
        returns = close_prices.pct_change().dropna()
        
        # Portfolio returns
        portfolio_returns = (returns * weights).sum(axis=1)
        
        # Metrics
        total_return = ((close_prices.iloc[-1] / close_prices.iloc[0]) - 1) * 100
        annual_return = (portfolio_returns.mean() * 252) * 100
        annual_volatility = portfolio_returns.std() * math.sqrt(252) * 100
        sharpe_ratio = (portfolio_returns.mean() * 252) / (portfolio_returns.std() * math.sqrt(252)) if portfolio_returns.std() > 0 else 0
        max_drawdown = ((close_prices.cumsum().expanding().max() - close_prices.cumsum()) / close_prices.cumsum().expanding().max()).min() * 100
        
        # Correlation matrix
        corr_matrix = returns.corr().to_dict()
        
        return {
            'success': True,
            'tickers': tickers,
            'weights': {t: w for t, w in zip(tickers, weights)},
            'metrics': {
                'total_return_pct': round(total_return, 2),
                'annualized_return_pct': round(annual_return, 2),
                'annual_volatility_pct': round(annual_volatility, 2),
                'sharpe_ratio': round(sharpe_ratio, 4),
                'max_drawdown_pct': round(max_drawdown, 2),
                'period': period
            },
            'correlations': corr_matrix,
            'data_points': len(returns)
        }
    
    except Exception as e:
        logger.error(f"Error in analyze_portfolio: {str(e)}")
        return {'success': False, 'error': str(e)}

def calculate_metrics(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate detailed financial metrics for assets."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        metrics = {}
        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period='1y')
                
                if hist.empty:
                    metrics[ticker] = {'error': f'No data for {ticker}'}
                    continue
                
                returns = hist['Close'].pct_change().dropna()
                current_price = hist['Close'].iloc[-1]
                avg_price = hist['Close'].mean()
                
                volatility = returns.std() * math.sqrt(252) * 100
                sharpe = (returns.mean() * 252) / (returns.std() * math.sqrt(252)) if returns.std() > 0 else 0
                beta = stock.info.get('beta', 'N/A')
                pe_ratio = stock.info.get('trailingPE', 'N/A')
                
                metrics[ticker] = {
                    'current_price': round(current_price, 2),
                    'avg_price_1y': round(avg_price, 2),
                    'volatility_pct': round(volatility, 2),
                    'sharpe_ratio': round(sharpe, 4),
                    'beta': round(float(beta), 3) if isinstance(beta, (int, float)) else beta,
                    'pe_ratio': round(pe_ratio, 2) if isinstance(pe_ratio, (int, float)) else pe_ratio,
                    'status': 'success'
                }
            except Exception as e:
                metrics[ticker] = {'error': str(e)}
        
        return {'success': True, 'metrics': metrics}
    
    except Exception as e:
        logger.error(f"Error in calculate_metrics: {str(e)}")
        return {'success': False, 'error': str(e)}

def assess_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Assess portfolio risk with multiple risk metrics."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        weights = _validate_weights(payload.get('weights'), tickers)
        confidence_level = payload.get('confidence_level', 0.95)
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        data = yf.download(' '.join(tickers), period='2y', progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            close_prices = data['Close']
        else:
            close_prices = data['Close']
        
        returns = close_prices.pct_change().dropna()
        portfolio_returns = (returns * weights).sum(axis=1)
        
        # Risk metrics
        variance = portfolio_returns.var()
        std_dev = portfolio_returns.std() * math.sqrt(252)
        
        # Value at Risk (VaR)
        var = portfolio_returns.quantile(1 - confidence_level)
        
        # Conditional VaR
        cvar = portfolio_returns[portfolio_returns <= var].mean()
        
        # Individual asset volatility
        individual_volatility = (returns.std() * math.sqrt(252)).to_dict()
        
        return {
            'success': True,
            'risk_metrics': {
                'portfolio_variance': round(variance, 6),
                'annual_std_dev_pct': round(std_dev * 100, 2),
                'value_at_risk_pct': round(var * 100, 2),
                'conditional_var_pct': round(cvar * 100, 2),
                'confidence_level': confidence_level
            },
            'individual_volatility': {t: round(v * 100, 2) for t, v in individual_volatility.items()},
            'risk_assessment': 'HIGH' if std_dev > 0.2 else 'MEDIUM' if std_dev > 0.1 else 'LOW'
        }
    
    except Exception as e:
        logger.error(f"Error in assess_risk: {str(e)}")
        return {'success': False, 'error': str(e)}

def analyze_returns(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze returns distribution and performance."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        weights = _validate_weights(payload.get('weights'), tickers)
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        data = yf.download(' '.join(tickers), period='2y', progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            close_prices = data['Close']
        else:
            close_prices = data['Close']
        
        returns = close_prices.pct_change().dropna()
        portfolio_returns = (returns * weights).sum(axis=1)
        
        # Return analysis
        daily_return = portfolio_returns.mean() * 100
        annual_return = daily_return * 252
        return_std = portfolio_returns.std() * 100
        skewness = ((portfolio_returns - portfolio_returns.mean()) ** 3).mean() / (portfolio_returns.std() ** 3)
        kurtosis = ((portfolio_returns - portfolio_returns.mean()) ** 4).mean() / (portfolio_returns.std() ** 4) - 3
        
        # Win/loss ratio
        positive_returns = (portfolio_returns > 0).sum()
        negative_returns = (portfolio_returns < 0).sum()
        win_rate = (positive_returns / len(portfolio_returns)) * 100 if len(portfolio_returns) > 0 else 0
        
        # Individual returns
        individual_returns = (returns.mean() * 252).to_dict()
        
        return {
            'success': True,
            'portfolio_returns': {
                'daily_return_pct': round(daily_return, 4),
                'annualized_return_pct': round(annual_return, 2),
                'return_std_pct': round(return_std, 2),
                'skewness': round(skewness, 4),
                'kurtosis': round(kurtosis, 4)
            },
            'return_distribution': {
                'positive_days': int(positive_returns),
                'negative_days': int(negative_returns),
                'win_rate_pct': round(win_rate, 2)
            },
            'individual_returns': {t: round(r * 100, 2) for t, r in individual_returns.items()}
        }
    
    except Exception as e:
        logger.error(f"Error in analyze_returns: {str(e)}")
        return {'success': False, 'error': str(e)}

def analyze_allocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze asset allocation and diversification."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        weights = _validate_weights(payload.get('weights'), tickers)
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        data = yf.download(' '.join(tickers), period='1y', progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            close_prices = data['Close']
        else:
            close_prices = data['Close']
        
        returns = close_prices.pct_change().dropna()
        
        # Correlation matrix
        corr_matrix = returns.corr()
        
        # Herfindahl index (concentration measure)
        herfindahl = sum([w ** 2 for w in weights])
        
        # Diversification ratio
        individual_volatility = returns.std() * math.sqrt(252)
        portfolio_volatility = (returns.std() * math.sqrt(252)).mean()
        diversification_ratio = portfolio_volatility.mean() / ((returns * weights).std() * math.sqrt(252))
        
        # Asset class concentration
        allocation = {t: w for t, w in zip(tickers, weights)}
        
        return {
            'success': True,
            'allocation': allocation,
            'diversification_metrics': {
                'herfindahl_index': round(herfindahl, 4),
                'effective_assets': round(1 / herfindahl, 2),
                'diversification_ratio': round(diversification_ratio, 4),
                'concentration': 'HIGH' if herfindahl > 0.4 else 'MEDIUM' if herfindahl > 0.25 else 'LOW'
            },
            'correlation_matrix': corr_matrix.to_dict(),
            'recommendation': 'Consider diversifying' if herfindahl > 0.4 else 'Good diversification'
        }
    
    except Exception as e:
        logger.error(f"Error in analyze_allocation: {str(e)}")
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

        logger.info(f"Executing action: {action} with payload: {payload}")

        # Action dispatch
        actions = {
            'analyze_portfolio': analyze_portfolio,
            'calculate_metrics': calculate_metrics,
            'assess_risk': assess_risk,
            'analyze_returns': analyze_returns,
            'analyze_allocation': analyze_allocation
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
