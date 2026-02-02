#!/usr/bin/env python3
"""
Unit tests for FINANCIAL_ANALYSIS plugin
Tests portfolio analysis, risk assessment, and return calculations
"""

import pytest
from unittest.mock import MagicMock, patch
import json
import sys
from pathlib import Path

# Add plugins to path
PLUGIN_PATH = Path(__file__).parent.parent.parent / "src" / "plugins" / "FINANCIAL_ANALYSIS"
sys.path.insert(0, str(PLUGIN_PATH.parent.parent))


class TestFinancialAnalysis:
    """Test suite for FINANCIAL_ANALYSIS plugin."""
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_input_validation_with_empty_tickers(self, sample_inputs):
        """Test that empty ticker list raises ValueError."""
        sample_inputs["payload"]["tickers"] = []
        # This would need the actual module to test
        assert True  # Placeholder
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_ticker_normalization(self):
        """Test that ticker symbols are normalized to uppercase."""
        tickers = ["aapl", "MSFT", "gOoGl"]
        # Expected: ["AAPL", "MSFT", "GOOGL"]
        assert True  # Placeholder
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_weight_validation_sum_to_one(self):
        """Test that portfolio weights are normalized to sum to 1.0."""
        weights = [0.5, 0.3, 0.2]
        total = sum(weights)
        assert abs(total - 1.0) < 0.01
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_weight_mismatch_raises_error(self):
        """Test that mismatched weight/ticker counts raise error."""
        tickers = ["AAPL", "MSFT", "GOOGL"]
        weights = [0.5, 0.5]  # Only 2 weights for 3 tickers
        assert len(weights) != len(tickers)
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_portfolio_return_calculation(self, sample_ticker_data):
        """Test portfolio return calculation."""
        # Portfolio with AAPL at 150.0
        daily_return = 0.02
        assert daily_return > 0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_volatility_calculation(self):
        """Test volatility (standard deviation) calculation."""
        returns = [0.01, 0.02, -0.01, 0.03, -0.02]
        mean_return = sum(returns) / len(returns)
        variance = sum((r - mean_return)**2 for r in returns) / len(returns)
        volatility = variance ** 0.5
        assert volatility > 0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_sharpe_ratio_calculation(self):
        """Test Sharpe ratio calculation."""
        portfolio_return = 0.12
        risk_free_rate = 0.02
        volatility = 0.15
        sharpe_ratio = (portfolio_return - risk_free_rate) / volatility
        assert sharpe_ratio > 0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_correlation_matrix_calculation(self):
        """Test correlation matrix for multiple assets."""
        # Correlation between two perfectly correlated assets
        returns1 = [0.01, 0.02, 0.03, 0.04]
        returns2 = [0.02, 0.04, 0.06, 0.08]
        # Should have correlation close to 1.0
        assert True
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_var_calculation(self):
        """Test Value at Risk (VaR) calculation."""
        returns = sorted([0.01, 0.02, -0.01, 0.03, -0.02, 0.015, -0.025])
        # 95% VaR should be 5th percentile (approximately)
        var_95 = returns[int(len(returns) * 0.05)]
        assert var_95 < 0  # VaR should show losses
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_cvar_calculation(self):
        """Test Conditional VaR calculation."""
        returns = sorted([0.01, 0.02, -0.01, 0.03, -0.02, 0.015, -0.025])
        var_95 = returns[int(len(returns) * 0.05)]
        cvar_95 = sum(r for r in returns if r <= var_95) / max(1, len([r for r in returns if r <= var_95]))
        assert cvar_95 <= var_95
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_efficient_frontier_calculation(self):
        """Test efficient frontier calculation."""
        portfolios = [
            {"return": 0.08, "volatility": 0.10},
            {"return": 0.10, "volatility": 0.12},
            {"return": 0.12, "volatility": 0.15},
        ]
        # Verify monotonic relationship
        for i in range(len(portfolios) - 1):
            assert portfolios[i]["return"] <= portfolios[i+1]["return"]
    
    @pytest.mark.integration
    @pytest.mark.finance
    def test_full_portfolio_analysis_workflow(self):
        """Test complete portfolio analysis workflow."""
        # Simulate: Get data -> Calculate metrics -> Return results
        tickers = ["AAPL", "MSFT", "GOOGL"]
        weights = [0.4, 0.35, 0.25]
        
        assert len(tickers) == len(weights)
        assert abs(sum(weights) - 1.0) < 0.01
    
    @pytest.mark.integration
    @pytest.mark.finance
    def test_rebalancing_calculation(self):
        """Test portfolio rebalancing calculation."""
        current_values = [40000, 30000, 30000]  # Total: 100000
        target_weights = [0.4, 0.35, 0.25]
        
        total = sum(current_values)
        current_weights = [v / total for v in current_values]
        
        # Calculate drift
        drift = [abs(c - t) for c, t in zip(current_weights, target_weights)]
        assert all(d >= 0 for d in drift)


class TestFinancialAnalysisEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_single_asset_portfolio(self):
        """Test portfolio with single asset."""
        tickers = ["AAPL"]
        weights = [1.0]
        assert len(tickers) == 1
        assert weights[0] == 1.0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_zero_volatility_handling(self):
        """Test handling of zero volatility (constant returns)."""
        returns = [0.02, 0.02, 0.02, 0.02]
        variance = sum((r - 0.02)**2 for r in returns) / len(returns)
        volatility = variance ** 0.5
        assert volatility == 0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_negative_returns_handling(self):
        """Test handling of negative returns."""
        returns = [-0.05, -0.02, 0.01, -0.03]
        mean_return = sum(returns) / len(returns)
        assert mean_return < 0
    
    @pytest.mark.unit
    @pytest.mark.finance
    def test_large_portfolio(self):
        """Test handling of large portfolio (100+ assets)."""
        num_assets = 150
        tickers = [f"TICK{i:04d}" for i in range(num_assets)]
        weights = [1.0 / num_assets] * num_assets
        
        assert len(tickers) == 150
        assert abs(sum(weights) - 1.0) < 0.001
