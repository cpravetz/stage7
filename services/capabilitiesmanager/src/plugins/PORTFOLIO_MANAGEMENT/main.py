#!/usr/bin/env python3
"""
PORTFOLIO_MANAGEMENT Plugin - Portfolio management and optimization
Handles portfolio rebalancing, asset allocation optimization, and generates recommendations
"""

import sys
import json
import logging
import os
import math
from typing import Dict, Any, List, Tuple, Optional

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

def rebalance_portfolio(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Rebalance portfolio to target allocations or equal weights."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        current_weights = _validate_weights(payload.get('current_weights'), tickers)
        target_weights = payload.get('target_weights')
        portfolio_value = float(payload.get('portfolio_value', 100000))
        
        if target_weights:
            target_weights = _validate_weights(target_weights, tickers)
        else:
            target_weights = [1.0 / len(tickers) for _ in tickers]
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        # Get current prices
        data = yf.download(' '.join(tickers), period='1d', progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            prices = {tickers[0]: data['Close'].iloc[-1]}
        else:
            prices = data['Close'].iloc[-1].to_dict()
        
        # Calculate current values
        current_values = {}
        current_units = {}
        for ticker, weight in zip(tickers, current_weights):
            value = portfolio_value * weight
            price = prices.get(ticker)
            if price is None:
                raise ValueError(f"Could not get price for {ticker}")
            units = value / price
            current_values[ticker] = value
            current_units[ticker] = units
        
        # Calculate target values and units
        target_values = {}
        target_units = {}
        rebalance_trades = []
        
        for ticker, weight in zip(tickers, target_weights):
            target_value = portfolio_value * weight
            price = prices.get(ticker)
            target_unit = target_value / price
            
            target_values[ticker] = target_value
            target_units[ticker] = target_unit
            
            current_unit = current_units.get(ticker, 0)
            unit_diff = target_unit - current_unit
            value_diff = target_value - current_values.get(ticker, 0)
            
            if abs(unit_diff) > 0.01:
                action = 'BUY' if unit_diff > 0 else 'SELL'
                rebalance_trades.append({
                    'ticker': ticker,
                    'action': action,
                    'current_units': round(current_unit, 2),
                    'target_units': round(target_unit, 2),
                    'units_to_trade': round(abs(unit_diff), 2),
                    'current_value': round(current_values.get(ticker, 0), 2),
                    'target_value': round(target_value, 2),
                    'value_change': round(value_diff, 2),
                    'price': round(price, 2)
                })
        
        # Calculate rebalancing cost (estimated)
        estimated_cost = sum([abs(trade['value_change']) * 0.001 for trade in rebalance_trades])
        
        return {
            'success': True,
            'current_allocation': {t: round(w, 4) for t, w in zip(tickers, current_weights)},
            'target_allocation': {t: round(w, 4) for t, w in zip(tickers, target_weights)},
            'portfolio_value': round(portfolio_value, 2),
            'rebalance_trades': rebalance_trades,
            'estimated_cost': round(estimated_cost, 2),
            'rebalancing_needed': len(rebalance_trades) > 0
        }
    
    except Exception as e:
        logger.error(f"Error in rebalance_portfolio: {str(e)}")
        return {'success': False, 'error': str(e)}

def optimize_allocation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Optimize asset allocation for maximum Sharpe ratio."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        risk_tolerance = payload.get('risk_tolerance', 'moderate')
        min_weight = float(payload.get('min_weight', 0.05))
        max_weight = float(payload.get('max_weight', 0.5))
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        # Fetch historical data
        data = yf.download(' '.join(tickers), period='2y', progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            close_prices = data['Close']
        else:
            close_prices = data['Close']
        
        returns = close_prices.pct_change().dropna()
        
        # Calculate covariance matrix
        cov_matrix = returns.cov() * 252
        mean_returns = returns.mean() * 252
        
        # Risk-free rate assumption
        risk_free_rate = 0.02
        
        # Simple optimization: equal weight baseline, then adjust
        n_assets = len(tickers)
        weights = np.array([1 / n_assets] * n_assets)
        
        # Adjust based on risk tolerance
        volatilities = returns.std() * math.sqrt(252)
        expected_returns = mean_returns
        
        if risk_tolerance.lower() == 'conservative':
            # Lower volatility preference
            weights = np.array([1 / (v + 1) for v in volatilities])
        elif risk_tolerance.lower() == 'aggressive':
            # Higher return preference
            weights = np.array([r / (1 if r > 0 else 1) for r in expected_returns])
        else:
            # Moderate: balance
            weights = np.array([(r / v) if v > 0 else 0 for r, v in zip(expected_returns, volatilities)])
        
        # Normalize weights
        weights = weights / weights.sum()
        
        # Ensure within constraints
        weights = np.maximum(weights, min_weight)
        weights = np.minimum(weights, max_weight)
        weights = weights / weights.sum()
        
        # Calculate portfolio metrics
        portfolio_return = np.sum(weights * mean_returns)
        portfolio_std = np.sqrt(np.dot(weights, np.dot(cov_matrix, weights)))
        sharpe_ratio = (portfolio_return - risk_free_rate) / portfolio_std if portfolio_std > 0 else 0
        
        return {
            'success': True,
            'optimized_allocation': {t: round(w, 4) for t, w in zip(tickers, weights)},
            'expected_return_pct': round(portfolio_return * 100, 2),
            'expected_volatility_pct': round(portfolio_std * 100, 2),
            'sharpe_ratio': round(sharpe_ratio, 4),
            'risk_tolerance': risk_tolerance,
            'constraints': {
                'min_weight': min_weight,
                'max_weight': max_weight
            },
            'individual_metrics': {
                t: {
                    'expected_return_pct': round(r * 100, 2),
                    'volatility_pct': round(v * 100, 2),
                    'return_to_risk': round((r / v) if v > 0 else 0, 4)
                }
                for t, r, v in zip(tickers, expected_returns, volatilities)
            }
        }
    
    except Exception as e:
        logger.error(f"Error in optimize_allocation: {str(e)}")
        return {'success': False, 'error': str(e)}

def calculate_correlations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate correlation matrix between assets."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        period = payload.get('period', '1y')
        
        if not HAS_YFINANCE:
            return {'success': False, 'error': 'yfinance not installed'}
        
        data = yf.download(' '.join(tickers), period=period, progress=False)
        
        if data.empty:
            raise ValueError(f"No data for tickers: {tickers}")
        
        if len(tickers) == 1:
            return {
                'success': True,
                'correlation_matrix': {tickers[0]: {tickers[0]: 1.0}},
                'period': period,
                'message': 'Single asset - correlation with itself is 1.0'
            }
        
        close_prices = data['Close']
        returns = close_prices.pct_change().dropna()
        
        corr_matrix = returns.corr()
        
        # Convert to dict format
        corr_dict = {}
        for idx1, ticker1 in enumerate(tickers):
            corr_dict[ticker1] = {}
            for idx2, ticker2 in enumerate(tickers):
                corr_dict[ticker1][ticker2] = round(corr_matrix.iloc[idx1, idx2], 4)
        
        # Identify highly correlated pairs
        highly_correlated = []
        for i in range(len(tickers)):
            for j in range(i + 1, len(tickers)):
                corr_value = corr_matrix.iloc[i, j]
                if abs(corr_value) > 0.85:
                    highly_correlated.append({
                        'pair': [tickers[i], tickers[j]],
                        'correlation': round(corr_value, 4)
                    })
        
        return {
            'success': True,
            'correlation_matrix': corr_dict,
            'period': period,
            'highly_correlated_pairs': highly_correlated,
            'diversification_note': 'Consider reducing correlated assets' if highly_correlated else 'Good diversification'
        }
    
    except Exception as e:
        logger.error(f"Error in calculate_correlations: {str(e)}")
        return {'success': False, 'error': str(e)}

def generate_recommendations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate portfolio recommendations based on analysis."""
    try:
        tickers = _validate_tickers(payload.get('tickers', []))
        weights = _validate_weights(payload.get('weights'), tickers)
        investment_goal = payload.get('investment_goal', 'growth')
        time_horizon = payload.get('time_horizon', '5y')
        
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
        
        # Portfolio metrics
        portfolio_returns = (returns * weights).sum(axis=1)
        annual_return = portfolio_returns.mean() * 252 * 100
        annual_volatility = portfolio_returns.std() * math.sqrt(252) * 100
        
        recommendations = []
        
        # Return-based recommendations
        if annual_return < 5:
            recommendations.append({
                'type': 'RETURN_OPTIMIZATION',
                'severity': 'HIGH',
                'message': f'Portfolio return ({annual_return:.1f}%) is below market average',
                'action': 'Consider increasing equity allocation or adding growth stocks'
            })
        
        # Volatility-based recommendations
        if annual_volatility > 20:
            recommendations.append({
                'type': 'RISK_MITIGATION',
                'severity': 'MEDIUM',
                'message': f'Portfolio volatility ({annual_volatility:.1f}%) is elevated',
                'action': 'Consider adding bonds or defensive assets'
            })
        
        # Correlation-based recommendations
        if len(tickers) > 1:
            corr_matrix = returns.corr()
            avg_corr = corr_matrix.values[np.triu_indices_from(corr_matrix.values, k=1)].mean()
            
            if avg_corr > 0.75:
                recommendations.append({
                    'type': 'DIVERSIFICATION',
                    'severity': 'MEDIUM',
                    'message': f'Assets are highly correlated (avg: {avg_corr:.2f})',
                    'action': 'Add uncorrelated assets for better diversification'
                })
        
        # Goal-based recommendations
        if investment_goal.lower() == 'income':
            recommendations.append({
                'type': 'ASSET_CLASS',
                'severity': 'LOW',
                'message': 'Income-focused allocation',
                'action': 'Consider adding dividend-paying stocks and bonds'
            })
        elif investment_goal.lower() == 'growth':
            recommendations.append({
                'type': 'ASSET_CLASS',
                'severity': 'LOW',
                'message': 'Growth-focused allocation',
                'action': 'Consider increasing equity exposure'
            })
        
        # Time horizon recommendations
        if time_horizon == '<1y':
            recommendations.append({
                'type': 'TIME_HORIZON',
                'severity': 'MEDIUM',
                'message': 'Short time horizon requires conservative approach',
                'action': 'Increase fixed income allocation'
            })
        
        return {
            'success': True,
            'current_metrics': {
                'annual_return_pct': round(annual_return, 2),
                'annual_volatility_pct': round(annual_volatility, 2),
                'sharpe_ratio': round((annual_return / annual_volatility) if annual_volatility > 0 else 0, 4)
            },
            'investment_goal': investment_goal,
            'time_horizon': time_horizon,
            'recommendations': recommendations,
            'total_recommendations': len(recommendations)
        }
    
    except Exception as e:
        logger.error(f"Error in generate_recommendations: {str(e)}")
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

        logger.info(f"Executing action: {action} with payload keys: {list(payload.keys())}")

        # Action dispatch
        actions = {
            'rebalance_portfolio': rebalance_portfolio,
            'optimize_allocation': optimize_allocation,
            'calculate_correlations': calculate_correlations,
            'generate_recommendations': generate_recommendations
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
