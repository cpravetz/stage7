#!/usr/bin/env python3
"""
CARE_PLAN Plugin - Clinical care plan creation and management
Provides comprehensive care planning tools with medical validation, outcome tracking,
and progress monitoring. Includes clinical recommendations and goal tracking.
"""

import sys
import json
import logging
import os
import sqlite3
import uuid
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import re

# Configure comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# MEDICAL TERMINOLOGY & VALIDATION
# ============================================================================

class MedicalValidator:
    """Validates medical data according to clinical standards."""
    
    # Valid clinical diagnoses (ICD-10 examples)
    VALID_DIAGNOSES = {
        'E11': 'Type 2 diabetes mellitus',
        'I10': 'Essential (primary) hypertension',
        'J44': 'Chronic obstructive pulmonary disease',
        'E78': 'Abdominal obesity',
        'E78.5': 'Hyperlipidemia, unspecified',
        'F41': 'Anxiety disorders',
        'M79': 'Other and unspecified soft tissue disorders',
        'E08': 'Diabetes mellitus due to underlying condition',
        'E09': 'Drug or chemical induced diabetes mellitus',
        'E13': 'Other specified diabetes mellitus',
        'I11': 'Hypertensive chronic kidney disease',
        'I13': 'Hypertensive heart and chronic kidney disease'
    }
    
    # Valid treatment modalities
    VALID_TREATMENTS = {
        'medication': 'Pharmacological treatment',
        'therapy': 'Physical or behavioral therapy',
        'lifestyle': 'Lifestyle modification',
        'exercise': 'Exercise program',
        'diet': 'Dietary management',
        'monitoring': 'Clinical monitoring',
        'surgery': 'Surgical intervention',
        'rehabilitation': 'Rehabilitation program',
        'counseling': 'Patient counseling',
        'specialist': 'Specialist consultation'
    }
    
    # Valid clinical outcomes
    VALID_OUTCOME_TYPES = [
        'symptom_improvement',
        'lab_improvement',
        'medication_compliance',
        'lifestyle_adherence',
        'pain_reduction',
        'functional_improvement',
        'quality_of_life',
        'weight_management',
        'disease_reversal'
    ]
    
    # Valid assessment metrics
    VALID_METRICS = {
        'vital_signs': 'Blood pressure, heart rate, temperature',
        'lab_values': 'Blood glucose, cholesterol, kidney function',
        'functional_status': 'Activity level, mobility',
        'pain_scale': '0-10 pain rating scale',
        'symptom_checklist': 'Patient-reported symptoms',
        'quality_of_life': 'EQ-5D or SF-36 scores'
    }
    
    # Realistic goal timeframes (days)
    VALID_TIMEFRAMES = {
        'short_term': (7, 30),      # 1-4 weeks
        'medium_term': (30, 90),    # 1-3 months
        'long_term': (90, 365),     # 3-12 months
        'extended': (365, 1095)     # 1-3 years
    }
    
    @staticmethod
    def validate_diagnosis(diagnosis_code: str, diagnosis_description: str) -> Tuple[bool, str]:
        """Validate ICD-10 diagnosis codes."""
        if not diagnosis_code or not diagnosis_description:
            return False, "Diagnosis code and description required"
        
        # Validate code format (e.g., E11, I10.9)
        if not re.match(r'^[A-Z]\d{2}(\.\d{1,2})?$', diagnosis_code):
            return False, f"Invalid ICD-10 code format: {diagnosis_code}"
        
        # Check length of description
        if len(diagnosis_description) < 5 or len(diagnosis_description) > 500:
            return False, "Diagnosis description must be 5-500 characters"
        
        logger.info(f"Diagnosis validation successful: {diagnosis_code}")
        return True, "Diagnosis valid"
    
    @staticmethod
    def validate_treatment(treatment_type: str, treatment_details: str) -> Tuple[bool, str]:
        """Validate treatment plan entries."""
        if treatment_type not in MedicalValidator.VALID_TREATMENTS:
            return False, f"Invalid treatment type: {treatment_type}"
        
        if not treatment_details or len(treatment_details) < 5:
            return False, "Treatment details must be at least 5 characters"
        
        if len(treatment_details) > 1000:
            return False, "Treatment details exceed maximum length (1000 chars)"
        
        logger.info(f"Treatment validation successful: {treatment_type}")
        return True, "Treatment valid"
    
    @staticmethod
    def validate_goal(goal_description: str, timeframe: str) -> Tuple[bool, str]:
        """Validate care plan goals."""
        if not goal_description or len(goal_description) < 10:
            return False, "Goal must be at least 10 characters"
        
        if len(goal_description) > 500:
            return False, "Goal description exceeds maximum length"
        
        if timeframe not in MedicalValidator.VALID_TIMEFRAMES:
            return False, f"Invalid timeframe: {timeframe}"
        
        # Check for SMART criteria
        smart_keywords = ['increase', 'decrease', 'improve', 'achieve', 'maintain', 'reduce', 'improve']
        has_action = any(keyword in goal_description.lower() for keyword in smart_keywords)
        if not has_action:
            return False, "Goal should contain measurable action verb"
        
        logger.info(f"Goal validation successful: {timeframe} goal")
        return True, "Goal valid"
    
    @staticmethod
    def validate_outcome(outcome_type: str, measurement: str, value: Any) -> Tuple[bool, str]:
        """Validate outcome tracking entries."""
        if outcome_type not in MedicalValidator.VALID_OUTCOME_TYPES:
            return False, f"Invalid outcome type: {outcome_type}"
        
        if not measurement or len(str(measurement)) < 3:
            return False, "Measurement description required"
        
        if value is None:
            return False, "Outcome value required"
        
        logger.info(f"Outcome validation successful: {outcome_type}")
        return True, "Outcome valid"
    
    @staticmethod
    def validate_clinical_recommendation(recommendation: str) -> Tuple[bool, str]:
        """Validate clinical recommendations."""
        if not recommendation or len(recommendation) < 20:
            return False, "Recommendation must be at least 20 characters"
        
        if len(recommendation) > 2000:
            return False, "Recommendation exceeds maximum length"
        
        # Check for professional language
        if recommendation.count('!') > 2 or recommendation.count('?') > 1:
            return False, "Recommendation should maintain professional tone"
        
        logger.info("Clinical recommendation validation successful")
        return True, "Recommendation valid"


# ============================================================================
# CARE PLAN DATABASE MANAGEMENT
# ============================================================================

class CarePlanDB:
    """Care plan database management with clinical tracking."""
    
    def __init__(self):
        """Initialize care plan database."""
        self.db_path = os.getenv('CARE_PLAN_DB_PATH', '/tmp/care_plans.db')
        self.validator = MedicalValidator()
        self._init_care_plan_db()
    
    def _init_care_plan_db(self):
        """Initialize care plan database schema."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Main care plans table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS care_plans (
                    id TEXT PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    created_by_provider_id TEXT NOT NULL,
                    primary_diagnosis TEXT NOT NULL,
                    diagnosis_code TEXT NOT NULL,
                    plan_title TEXT NOT NULL,
                    plan_description TEXT,
                    status TEXT DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    modified_at TIMESTAMP,
                    modified_by TEXT,
                    review_date TIMESTAMP,
                    version INTEGER DEFAULT 1
                )
            ''')
            
            # Care plan goals
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS care_goals (
                    id TEXT PRIMARY KEY,
                    care_plan_id TEXT NOT NULL,
                    goal_description TEXT NOT NULL,
                    goal_category TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    target_date TIMESTAMP NOT NULL,
                    status TEXT DEFAULT 'active',
                    progress_percentage INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    achieved_at TIMESTAMP,
                    FOREIGN KEY (care_plan_id) REFERENCES care_plans(id)
                )
            ''')
            
            # Treatments/interventions
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS treatments (
                    id TEXT PRIMARY KEY,
                    care_plan_id TEXT NOT NULL,
                    treatment_type TEXT NOT NULL,
                    treatment_details TEXT NOT NULL,
                    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_date TIMESTAMP,
                    frequency TEXT,
                    provider_id TEXT NOT NULL,
                    status TEXT DEFAULT 'active',
                    FOREIGN KEY (care_plan_id) REFERENCES care_plans(id)
                )
            ''')
            
            # Outcome tracking
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS outcomes (
                    id TEXT PRIMARY KEY,
                    care_plan_id TEXT NOT NULL,
                    outcome_type TEXT NOT NULL,
                    measurement TEXT NOT NULL,
                    measurement_unit TEXT,
                    baseline_value REAL,
                    current_value REAL,
                    target_value REAL,
                    assessment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    assessor_id TEXT NOT NULL,
                    notes TEXT,
                    FOREIGN KEY (care_plan_id) REFERENCES care_plans(id)
                )
            ''')
            
            # Progress notes
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS progress_notes (
                    id TEXT PRIMARY KEY,
                    care_plan_id TEXT NOT NULL,
                    note_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (care_plan_id) REFERENCES care_plans(id)
                )
            ''')
            
            # Clinical recommendations
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS recommendations (
                    id TEXT PRIMARY KEY,
                    care_plan_id TEXT NOT NULL,
                    recommendation_text TEXT NOT NULL,
                    recommendation_type TEXT NOT NULL,
                    priority TEXT DEFAULT 'normal',
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active'
                )
            ''')
            
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_patient ON care_plans(patient_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_provider ON care_plans(created_by_provider_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_status ON care_plans(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_diagnosis ON care_plans(diagnosis_code)')
            
            conn.commit()
            conn.close()
            logger.info("Care plan database initialized")
        except Exception as e:
            logger.error(f"Failed to initialize care plan database: {str(e)}")
            raise
    
    def create_care_plan(self, patient_id: str, provider_id: str, 
                        primary_diagnosis: str, diagnosis_code: str,
                        plan_title: str, plan_description: str = None) -> Dict:
        """Create comprehensive care plan with medical validation."""
        try:
            # Validate diagnosis
            is_valid, validation_msg = self.validator.validate_diagnosis(
                diagnosis_code, primary_diagnosis)
            if not is_valid:
                logger.error(f"Diagnosis validation failed: {validation_msg}")
                return {
                    'success': False,
                    'error': validation_msg,
                    'care_plan_id': None
                }
            
            # Validate patient and provider IDs
            if not patient_id or not provider_id:
                return {
                    'success': False,
                    'error': 'Patient ID and provider ID required',
                    'care_plan_id': None
                }
            
            if not plan_title or len(plan_title) < 5:
                return {
                    'success': False,
                    'error': 'Care plan title required (minimum 5 characters)',
                    'care_plan_id': None
                }
            
            care_plan_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO care_plans 
                (id, patient_id, created_by_provider_id, primary_diagnosis, 
                 diagnosis_code, plan_title, plan_description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (care_plan_id, patient_id, provider_id, primary_diagnosis,
                  diagnosis_code, plan_title, plan_description or '', timestamp))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Care plan created: {care_plan_id} for patient {patient_id}")
            
            return {
                'success': True,
                'care_plan_id': care_plan_id,
                'patient_id': patient_id,
                'primary_diagnosis': primary_diagnosis,
                'diagnosis_code': diagnosis_code,
                'plan_title': plan_title,
                'created_at': timestamp,
                'status': 'active'
            }
        
        except Exception as e:
            logger.error(f"Error creating care plan: {str(e)}")
            return {
                'success': False,
                'error': 'Error creating care plan',
                'care_plan_id': None
            }
    
    def update_care_plan(self, care_plan_id: str, provider_id: str,
                        plan_description: str = None, review_date: str = None) -> Dict:
        """Update care plan with version control."""
        try:
            if not care_plan_id or not provider_id:
                return {
                    'success': False,
                    'error': 'Care plan ID and provider ID required'
                }
            
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if plan exists
            cursor.execute('SELECT id FROM care_plans WHERE id = ?', (care_plan_id,))
            if not cursor.fetchone():
                conn.close()
                return {
                    'success': False,
                    'error': 'Care plan not found'
                }
            
            # Update plan
            cursor.execute('''
                UPDATE care_plans 
                SET plan_description = ?, modified_by = ?, modified_at = ?, version = version + 1
                WHERE id = ?
            ''', (plan_description or '', provider_id, timestamp, care_plan_id))
            
            if review_date:
                cursor.execute('''
                    UPDATE care_plans 
                    SET review_date = ?
                    WHERE id = ?
                ''', (review_date, care_plan_id))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Care plan updated: {care_plan_id}")
            return {
                'success': True,
                'care_plan_id': care_plan_id,
                'updated_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error updating care plan: {str(e)}")
            return {
                'success': False,
                'error': 'Error updating care plan'
            }
    
    def add_treatment(self, care_plan_id: str, treatment_type: str,
                     treatment_details: str, provider_id: str,
                     frequency: str = None, end_date: str = None) -> Dict:
        """Add treatment/intervention to care plan."""
        try:
            # Validate treatment
            is_valid, validation_msg = self.validator.validate_treatment(
                treatment_type, treatment_details)
            if not is_valid:
                logger.error(f"Treatment validation failed: {validation_msg}")
                return {
                    'success': False,
                    'error': validation_msg,
                    'treatment_id': None
                }
            
            if not care_plan_id or not provider_id:
                return {
                    'success': False,
                    'error': 'Care plan ID and provider ID required',
                    'treatment_id': None
                }
            
            treatment_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO treatments 
                (id, care_plan_id, treatment_type, treatment_details, 
                 provider_id, frequency, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (treatment_id, care_plan_id, treatment_type, treatment_details,
                  provider_id, frequency or '', end_date or None))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Treatment added: {treatment_id} to care plan {care_plan_id}")
            
            return {
                'success': True,
                'treatment_id': treatment_id,
                'care_plan_id': care_plan_id,
                'treatment_type': treatment_type,
                'created_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error adding treatment: {str(e)}")
            return {
                'success': False,
                'error': 'Error adding treatment',
                'treatment_id': None
            }
    
    def track_outcome(self, care_plan_id: str, outcome_type: str,
                     measurement: str, current_value: Any, assessor_id: str,
                     baseline_value: Any = None, target_value: Any = None,
                     measurement_unit: str = None, notes: str = None) -> Dict:
        """Track clinical outcome with baseline and target."""
        try:
            # Validate outcome
            is_valid, validation_msg = self.validator.validate_outcome(
                outcome_type, measurement, current_value)
            if not is_valid:
                logger.error(f"Outcome validation failed: {validation_msg}")
                return {
                    'success': False,
                    'error': validation_msg,
                    'outcome_id': None
                }
            
            if not care_plan_id or not assessor_id:
                return {
                    'success': False,
                    'error': 'Care plan ID and assessor ID required',
                    'outcome_id': None
                }
            
            outcome_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO outcomes 
                (id, care_plan_id, outcome_type, measurement, measurement_unit,
                 baseline_value, current_value, target_value, assessor_id, notes, 
                 assessment_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (outcome_id, care_plan_id, outcome_type, measurement, measurement_unit,
                  baseline_value, current_value, target_value, assessor_id, notes, timestamp))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Outcome tracked: {outcome_id} for care plan {care_plan_id}")
            
            return {
                'success': True,
                'outcome_id': outcome_id,
                'care_plan_id': care_plan_id,
                'outcome_type': outcome_type,
                'measurement': measurement,
                'current_value': current_value,
                'baseline_value': baseline_value,
                'target_value': target_value,
                'assessed_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error tracking outcome: {str(e)}")
            return {
                'success': False,
                'error': 'Error tracking outcome',
                'outcome_id': None
            }
    
    def assess_progress(self, care_plan_id: str, assessor_id: str,
                       assessment_note: str) -> Dict:
        """Assess overall progress and update goal achievements."""
        try:
            if not care_plan_id or not assessor_id or not assessment_note:
                return {
                    'success': False,
                    'error': 'Care plan ID, assessor ID, and assessment note required'
                }
            
            note_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Add progress note
            cursor.execute('''
                INSERT INTO progress_notes 
                (id, care_plan_id, note_type, content, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (note_id, care_plan_id, 'progress_assessment', assessment_note, 
                  assessor_id, timestamp))
            
            # Get outcomes for summary
            cursor.execute('''
                SELECT outcome_type, measurement, current_value, target_value 
                FROM outcomes 
                WHERE care_plan_id = ?
                ORDER BY assessment_date DESC
                LIMIT 10
            ''', (care_plan_id,))
            
            outcomes = [dict(row) for row in cursor.fetchall()]
            
            # Get active goals
            cursor.execute('''
                SELECT id, goal_description, progress_percentage
                FROM care_goals 
                WHERE care_plan_id = ? AND status = 'active'
            ''', (care_plan_id,))
            
            goals = [dict(row) for row in cursor.fetchall()]
            
            conn.commit()
            conn.close()
            
            logger.info(f"Progress assessment completed: {care_plan_id}")
            
            return {
                'success': True,
                'care_plan_id': care_plan_id,
                'assessment_id': note_id,
                'total_goals': len(goals),
                'recent_outcomes': len(outcomes),
                'assessed_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error assessing progress: {str(e)}")
            return {
                'success': False,
                'error': 'Error assessing progress'
            }
    
    def generate_report(self, care_plan_id: str) -> Dict:
        """Generate comprehensive care plan report."""
        try:
            if not care_plan_id:
                return {
                    'success': False,
                    'error': 'Care plan ID required',
                    'report': None
                }
            
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get care plan
            cursor.execute('SELECT * FROM care_plans WHERE id = ?', (care_plan_id,))
            plan_row = cursor.fetchone()
            
            if not plan_row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Care plan not found',
                    'report': None
                }
            
            # Get goals
            cursor.execute('''
                SELECT * FROM care_goals 
                WHERE care_plan_id = ?
                ORDER BY created_at
            ''', (care_plan_id,))
            goals = [dict(row) for row in cursor.fetchall()]
            
            # Get treatments
            cursor.execute('''
                SELECT * FROM treatments 
                WHERE care_plan_id = ?
                ORDER BY start_date
            ''', (care_plan_id,))
            treatments = [dict(row) for row in cursor.fetchall()]
            
            # Get recent outcomes
            cursor.execute('''
                SELECT * FROM outcomes 
                WHERE care_plan_id = ?
                ORDER BY assessment_date DESC
                LIMIT 20
            ''', (care_plan_id,))
            outcomes = [dict(row) for row in cursor.fetchall()]
            
            # Get recommendations
            cursor.execute('''
                SELECT * FROM recommendations 
                WHERE care_plan_id = ? AND status = 'active'
                ORDER BY created_at DESC
            ''', (care_plan_id,))
            recommendations = [dict(row) for row in cursor.fetchall()]
            
            # Get recent progress notes
            cursor.execute('''
                SELECT * FROM progress_notes 
                WHERE care_plan_id = ?
                ORDER BY created_at DESC
                LIMIT 5
            ''', (care_plan_id,))
            progress_notes = [dict(row) for row in cursor.fetchall()]
            
            conn.close()
            
            report = {
                'care_plan_id': care_plan_id,
                'patient_id': plan_row['patient_id'],
                'primary_diagnosis': plan_row['primary_diagnosis'],
                'diagnosis_code': plan_row['diagnosis_code'],
                'plan_title': plan_row['plan_title'],
                'status': plan_row['status'],
                'version': plan_row['version'],
                'created_at': plan_row['created_at'],
                'modified_at': plan_row['modified_at'],
                'review_date': plan_row['review_date'],
                'summary': {
                    'total_goals': len(goals),
                    'total_treatments': len(treatments),
                    'recent_outcomes': len(outcomes),
                    'active_recommendations': len(recommendations)
                },
                'goals': goals[:10],
                'treatments': treatments[:10],
                'recent_outcomes': outcomes[:10],
                'recommendations': recommendations[:5],
                'progress_notes': progress_notes[:5],
                'generated_at': datetime.utcnow().isoformat()
            }
            
            logger.info(f"Care plan report generated: {care_plan_id}")
            
            return {
                'success': True,
                'report': report
            }
        
        except Exception as e:
            logger.error(f"Error generating report: {str(e)}")
            return {
                'success': False,
                'error': 'Error generating report',
                'report': None
            }


# ============================================================================
# PLUGIN INTERFACE
# ============================================================================

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {'value':...} wrapper."""
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


def execute_plugin(inputs):
    """Main plugin execution function for care plan management."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Action parameter required"
            }]

        db = CarePlanDB()
        result = None

        # Create care plan
        if action == 'create_care_plan':
            patient_id = _get_input(payload, 'patient_id')
            provider_id = _get_input(payload, 'provider_id')
            primary_diagnosis = _get_input(payload, 'primary_diagnosis')
            diagnosis_code = _get_input(payload, 'diagnosis_code')
            plan_title = _get_input(payload, 'plan_title')
            plan_description = _get_input(payload, 'plan_description')

            if not all([patient_id, provider_id, primary_diagnosis, diagnosis_code, plan_title]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields"
                }]

            result = db.create_care_plan(patient_id, provider_id, primary_diagnosis,
                                        diagnosis_code, plan_title, plan_description)

        # Update care plan
        elif action == 'update_care_plan':
            care_plan_id = _get_input(payload, 'care_plan_id')
            provider_id = _get_input(payload, 'provider_id')
            plan_description = _get_input(payload, 'plan_description')
            review_date = _get_input(payload, 'review_date')

            if not all([care_plan_id, provider_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: care_plan_id, provider_id"
                }]

            result = db.update_care_plan(care_plan_id, provider_id, plan_description, review_date)

        # Add treatment
        elif action == 'add_treatment':
            care_plan_id = _get_input(payload, 'care_plan_id')
            treatment_type = _get_input(payload, 'treatment_type')
            treatment_details = _get_input(payload, 'treatment_details')
            provider_id = _get_input(payload, 'provider_id')
            frequency = _get_input(payload, 'frequency')
            end_date = _get_input(payload, 'end_date')

            if not all([care_plan_id, treatment_type, treatment_details, provider_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields"
                }]

            result = db.add_treatment(care_plan_id, treatment_type, treatment_details,
                                     provider_id, frequency, end_date)

        # Track outcome
        elif action == 'track_outcome':
            care_plan_id = _get_input(payload, 'care_plan_id')
            outcome_type = _get_input(payload, 'outcome_type')
            measurement = _get_input(payload, 'measurement')
            current_value = _get_input(payload, 'current_value')
            assessor_id = _get_input(payload, 'assessor_id')
            baseline_value = _get_input(payload, 'baseline_value')
            target_value = _get_input(payload, 'target_value')
            measurement_unit = _get_input(payload, 'measurement_unit')
            notes = _get_input(payload, 'notes')

            if not all([care_plan_id, outcome_type, measurement, current_value, assessor_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields"
                }]

            result = db.track_outcome(care_plan_id, outcome_type, measurement, current_value,
                                     assessor_id, baseline_value, target_value, 
                                     measurement_unit, notes)

        # Assess progress
        elif action == 'assess_progress':
            care_plan_id = _get_input(payload, 'care_plan_id')
            assessor_id = _get_input(payload, 'assessor_id')
            assessment_note = _get_input(payload, 'assessment_note')

            if not all([care_plan_id, assessor_id, assessment_note]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields"
                }]

            result = db.assess_progress(care_plan_id, assessor_id, assessment_note)

        # Generate report
        elif action == 'generate_report':
            care_plan_id = _get_input(payload, 'care_plan_id')

            if not care_plan_id:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required field: care_plan_id"
                }]

            result = db.generate_report(care_plan_id)

        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Action '{action}' not supported"
            }]

        if result:
            return [{
                "success": result.get('success', True),
                "name": "result",
                "resultType": "object",
                "result": result,
                "resultDescription": f"Result of {action} operation"
            }]
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"No result from action: {action}"
            }]

    except Exception as e:
        logger.error(f"Unexpected error in execute_plugin: {str(e)}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": "Internal server error",
            "error": "Care plan operation failed"
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
            "result": "Plugin execution failed",
            "error": "Care plan error"
        }]
        print(json.dumps(result))


if __name__ == "__main__":
    main()
