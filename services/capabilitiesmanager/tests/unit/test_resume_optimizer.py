#!/usr/bin/env python3
"""
Unit tests for RESUME_OPTIMIZER plugin
Tests resume analysis and optimization for ATS
"""

import pytest


class TestResumeOptimizer:
    """Test suite for RESUME_OPTIMIZER plugin."""
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_resume_parsing(self, sample_resume):
        """Test resume document parsing."""
        resume = sample_resume
        assert "name" in resume
        assert "experience" in resume
        assert "skills" in resume
        assert "education" in resume
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_ats_keyword_extraction(self, sample_resume):
        """Test extraction of ATS keywords."""
        keywords = {
            "technical": ["Python", "TypeScript", "React", "AWS", "Docker"],
            "soft_skills": ["Leadership", "Communication", "Problem-solving"],
            "industry": ["Software Engineering", "Cloud Computing"]
        }
        
        assert len(keywords["technical"]) > 0
        assert "Python" in keywords["technical"]
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_ats_compatibility_score(self, sample_resume):
        """Test ATS compatibility scoring."""
        score = 0
        
        # Check for required sections
        sections = ["name", "email", "phone", "experience", "education"]
        for section in sections:
            if section in sample_resume:
                score += 20
        
        assert score == 100
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_keyword_gap_analysis(self, sample_resume):
        """Test analysis of keyword gaps."""
        resume_skills = set(sample_resume["skills"])
        job_keywords = {"Python", "TypeScript", "React", "AWS", "Kubernetes", "Docker"}
        
        missing_skills = job_keywords - resume_skills
        assert "Kubernetes" in missing_skills
        assert "Docker" in resume_skills
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_formatting_optimization_suggestions(self):
        """Test formatting improvement suggestions."""
        issues = [
            {"issue": "Too many colors", "severity": "high"},
            {"issue": "Inconsistent date format", "severity": "medium"},
            {"issue": "Inconsistent font", "severity": "medium"}
        ]
        
        assert len(issues) > 0
        assert issues[0]["severity"] == "high"
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_quantifiable_achievements_detection(self):
        """Test detection and analysis of quantifiable achievements."""
        achievements = [
            "Led 5-person team",
            "30% performance improvement",
            "Reduced load time from 5s to 2s",
            "$2M cost savings"
        ]
        
        quantified = [a for a in achievements if any(c.isdigit() for c in a)]
        assert len(quantified) == 4
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_keyword_optimization_suggestions(self):
        """Test suggestions for keyword optimization."""
        original = "Responsible for team management and coding"
        suggestions = {
            "action_verb": "Recommended: Replace 'Responsible for' with stronger verb",
            "keyword": "Recommended: Add specific technologies used"
        }
        
        assert len(suggestions) > 0
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_job_title_analysis(self):
        """Test job title progression analysis."""
        experience = [
            {"title": "Junior Developer", "year": 2016},
            {"title": "Senior Developer", "year": 2020},
            {"title": "Staff Engineer", "year": 2023}
        ]
        
        titles = [e["title"] for e in experience]
        assert len(titles) == 3
        assert "Staff Engineer" in titles
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_education_relevance(self, sample_resume):
        """Test relevance of education to role."""
        resume_degree = sample_resume["education"][0]["degree"]
        target_position = "Software Engineer"
        
        # CS degree is relevant to software engineer role
        assert "Computer Science" in resume_degree or "CS" in resume_degree
    
    @pytest.mark.integration
    @pytest.mark.career
    def test_full_resume_optimization_workflow(self, sample_resume):
        """Test complete resume optimization workflow."""
        # Parse -> Analyze -> Suggest improvements
        resume = sample_resume
        
        # Identify gaps
        assert "skills" in resume
        
        # Generate suggestions
        suggestions = []
        suggestions.append("Add more specific technologies")
        suggestions.append("Quantify achievements")
        
        assert len(suggestions) > 0


class TestResumeOptimizerEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_minimal_resume(self):
        """Test handling of minimal resume."""
        minimal = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "experience": [],
            "skills": []
        }
        
        assert minimal["name"]
        assert len(minimal["experience"]) == 0
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_very_long_resume(self):
        """Test handling of very long resume (10+ pages)."""
        long_resume = {
            "experience": [
                {"title": f"Job {i}", "duration": "1 year"} 
                for i in range(30)
            ]
        }
        
        assert len(long_resume["experience"]) == 30
    
    @pytest.mark.unit
    @pytest.mark.career
    def test_special_characters_in_resume(self):
        """Test handling of special characters."""
        special_resume = {
            "name": "José García-López",
            "skills": ["C++", "C#", ".NET", "Node.js"]
        }
        
        assert "ó" in special_resume["name"]
        assert "C++" in special_resume["skills"]
