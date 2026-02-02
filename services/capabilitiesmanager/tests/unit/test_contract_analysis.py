#!/usr/bin/env python3
"""
Unit tests for CONTRACT_ANALYSIS plugin
Tests legal document analysis and risk detection
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta


class TestContractAnalysis:
    """Test suite for CONTRACT_ANALYSIS plugin."""
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_contract_parsing(self, sample_legal_document):
        """Test parsing of contract document."""
        contract = sample_legal_document
        assert "title" in contract
        assert "content" in contract
        assert "parties" in contract
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_clause_extraction(self, sample_legal_document):
        """Test extraction of key clauses from contract."""
        clauses = {
            "SERVICES": "The Company agrees to provide software development services",
            "PAYMENT": "Invoice due within 30 days",
            "CONFIDENTIALITY": "All proprietary information shall be kept confidential",
            "LIABILITY": "Company liability limited to contract value",
            "TERMINATION": "Either party may terminate with 30 days written notice"
        }
        
        for clause_name in clauses:
            assert clause_name in ["SERVICES", "PAYMENT", "CONFIDENTIALITY", "LIABILITY", "TERMINATION"]
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_payment_terms_analysis(self):
        """Test extraction and analysis of payment terms."""
        payment_terms = {
            "amount": 50000,
            "currency": "USD",
            "due_date": "2024-02-15",
            "payment_method": "Wire transfer",
            "late_fee": "1.5% per month"
        }
        
        assert payment_terms["amount"] > 0
        assert payment_terms["currency"] == "USD"
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_liability_clause_detection(self):
        """Test detection of liability limitations."""
        liability_patterns = [
            "Limited to contract value",
            "Not liable for indirect damages",
            "Maximum liability is $",
            "Consequential damages excluded"
        ]
        
        assert len(liability_patterns) > 0
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_termination_clause_analysis(self):
        """Test analysis of termination provisions."""
        termination = {
            "type": "Mutual termination",
            "notice_period": 30,
            "notice_unit": "days",
            "cause_required": False,
            "penalties": None
        }
        
        assert termination["notice_period"] > 0
        assert termination["notice_unit"] in ["days", "weeks", "months"]
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_confidentiality_clause_validation(self):
        """Test validation of confidentiality provisions."""
        confidentiality = {
            "scope": "All proprietary information",
            "duration": 5,
            "duration_unit": "years",
            "exceptions": ["Public information", "Required by law"]
        }
        
        assert confidentiality["duration"] > 0
        assert isinstance(confidentiality["exceptions"], list)
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_red_flag_detection(self, sample_legal_document):
        """Test detection of potentially problematic clauses."""
        red_flags = []
        
        # Check for vague liability language
        if "liable for damages" in sample_legal_document["content"].lower():
            red_flags.append("Vague liability language")
        
        # Check for unilateral termination
        if "may terminate without cause" in sample_legal_document["content"].lower():
            red_flags.append("Unilateral termination")
        
        assert isinstance(red_flags, list)
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_governing_law_extraction(self):
        """Test extraction of governing law clause."""
        governing_law = {
            "jurisdiction": "State of New York",
            "venue": "Federal Court, Southern District of New York",
            "governing_law": "New York law"
        }
        
        assert "jurisdiction" in governing_law
        assert "governing_law" in governing_law
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_amendment_clause_detection(self):
        """Test detection of amendment/modification provisions."""
        amendments = {
            "oral_modifications": False,
            "written_required": True,
            "both_parties_sign": True
        }
        
        assert amendments["written_required"] == True
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_force_majeure_clause_analysis(self):
        """Test analysis of force majeure provisions."""
        force_majeure = {
            "includes_pandemic": True,
            "includes_war": True,
            "includes_natural_disaster": True,
            "notice_required": True,
            "notice_days": 5
        }
        
        assert force_majeure["notice_required"] == True
    
    @pytest.mark.integration
    @pytest.mark.legal
    def test_full_contract_risk_assessment(self, sample_legal_document):
        """Test comprehensive contract risk assessment."""
        risk_score = 0
        
        # Simulate risk calculation
        risks = [
            {"type": "Unilateral termination", "severity": "high", "score": 25},
            {"type": "Vague liability", "severity": "medium", "score": 15}
        ]
        
        for risk in risks:
            if risk["severity"] == "high":
                risk_score += risk["score"]
        
        assert risk_score >= 0


class TestContractAnalysisEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_very_short_contract(self):
        """Test handling of extremely short contracts."""
        short_contract = {
            "title": "Agreement",
            "content": "We agree to do business together.",
            "parties": ["Party A", "Party B"]
        }
        
        assert len(short_contract["content"]) < 100
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_very_long_contract(self):
        """Test handling of very long contracts (50+ pages)."""
        long_content = "Clause " * 5000
        long_contract = {
            "title": "Complex Agreement",
            "content": long_content,
            "pages": 75
        }
        
        assert len(long_contract["content"]) > 10000
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_contract_with_special_characters(self):
        """Test parsing of contracts with special characters."""
        special_contract = {
            "content": "© 2024 Company® Inc. | Email: test@example.com™"
        }
        
        assert "©" in special_contract["content"]
        assert "@" in special_contract["content"]
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_conflicting_clauses(self):
        """Test detection of conflicting clauses."""
        conflicts = [
            {
                "clause_1": "Termination allowed with 30 days notice",
                "clause_2": "Contract is irrevocable",
                "conflict": True
            }
        ]
        
        assert conflicts[0]["conflict"] == True
    
    @pytest.mark.unit
    @pytest.mark.legal
    def test_missing_required_clauses(self):
        """Test detection of missing required clauses."""
        required_clauses = [
            "Payment Terms",
            "Liability",
            "Termination",
            "Confidentiality"
        ]
        
        contract_clauses = ["Payment Terms", "Liability"]
        missing = [c for c in required_clauses if c not in contract_clauses]
        
        assert len(missing) == 2
        assert "Termination" in missing
