#!/usr/bin/env python3
"""
MEDICAL_RECORDS Plugin - HIPAA-compliant medical record management
Provides secure storage, retrieval, and audit logging for electronic health records (EHR).
Implements encryption for Protected Health Information (PHI) and comprehensive access controls.
"""

import sys
import json
import logging
import os
import hashlib
import hmac
import sqlite3
import uuid
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
import base64

# Configure comprehensive audit logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# HIPAA COMPLIANCE CONFIGURATION
# ============================================================================

class HIPAAConfig:
    """Configuration for HIPAA compliance requirements."""
    
    # Valid provider roles for access control
    VALID_ROLES = ['physician', 'nurse', 'pharmacist', 'therapist', 'administrator', 'technician']
    
    # PHI (Protected Health Information) field identifiers
    PHI_FIELDS = [
        'medical_history', 'diagnosis', 'medication', 'lab_results',
        'vital_signs', 'imaging_results', 'procedure_notes', 'discharge_summary'
    ]
    
    # Audit event types
    AUDIT_EVENTS = {
        'RECORD_CREATED': 'Medical record created',
        'RECORD_RETRIEVED': 'Medical record retrieved',
        'RECORD_MODIFIED': 'Medical record modified',
        'RECORD_DELETED': 'Medical record deleted',
        'ACCESS_DENIED': 'Access denied to medical record',
        'RECORD_ACCESSED': 'Record access audit trail retrieved',
        'ENCRYPTION_ERROR': 'Record encryption/decryption error',
        'VALIDATION_ERROR': 'Record validation failed'
    }
    
    # Record retention policy (in days)
    MINIMUM_RETENTION_DAYS = 365 * 6  # 6 years minimum per HIPAA
    MAXIMUM_RETENTION_DAYS = 365 * 10  # 10 years maximum per healthcare standards


# ============================================================================
# ENCRYPTION & SECURITY UTILITIES
# ============================================================================

class RecordEncryption:
    """Handles encryption and decryption of PHI data."""
    
    def __init__(self):
        """Initialize encryption with derived key from environment or generate new."""
        key_source = os.getenv('HIPAA_ENCRYPTION_KEY', 'default-healthcare-key')
        # Derive a consistent 32-byte key using SHA256
        derived_key = hashlib.sha256(key_source.encode()).digest()
        self.cipher_suite = Fernet(base64.urlsafe_b64encode(derived_key[:32]))
        logger.info("Encryption suite initialized for PHI protection")
    
    def encrypt_phi(self, data: str) -> str:
        """Encrypt PHI data using Fernet symmetric encryption."""
        try:
            encrypted = self.cipher_suite.encrypt(data.encode())
            logger.info(f"PHI data encrypted successfully")
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Failed to encrypt PHI: {str(e)}")
            raise ValueError(f"Encryption error: {str(e)}")
    
    def decrypt_phi(self, encrypted_data: str) -> str:
        """Decrypt PHI data."""
        try:
            decrypted = self.cipher_suite.decrypt(encrypted_data.encode())
            logger.info(f"PHI data decrypted successfully")
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Failed to decrypt PHI: {str(e)}")
            raise ValueError(f"Decryption error: {str(e)}")


class AuditLog:
    """HIPAA-compliant audit logging for all record access."""
    
    def __init__(self):
        """Initialize audit log database."""
        self.db_path = os.getenv('AUDIT_DB_PATH', '/tmp/hipaa_audit.db')
        self._init_audit_db()
    
    def _init_audit_db(self):
        """Initialize audit log database with required schema."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    provider_role TEXT NOT NULL,
                    patient_id TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    action TEXT NOT NULL,
                    status TEXT NOT NULL,
                    ip_address TEXT,
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_patient_id ON audit_log(patient_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_record_id ON audit_log(record_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_id ON audit_log(user_id)')
            conn.commit()
            conn.close()
            logger.info("Audit log database initialized")
        except Exception as e:
            logger.error(f"Failed to initialize audit database: {str(e)}")
            raise
    
    def log_access(self, user_id: str, provider_role: str, patient_id: str, record_id: str,
                  event_type: str, action: str, status: str, details: str = None) -> str:
        """Log access event to audit trail."""
        try:
            log_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO audit_log 
                (id, timestamp, user_id, provider_role, patient_id, record_id, 
                 event_type, action, status, details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (log_id, timestamp, user_id, provider_role, patient_id, record_id,
                  event_type, action, status, details))
            conn.commit()
            conn.close()
            
            logger.info(f"Audit log entry created: {log_id} | {event_type} | {status}")
            return log_id
        except Exception as e:
            logger.error(f"Failed to log access: {str(e)}")
            raise
    
    def get_audit_trail(self, patient_id: str, record_id: str = None) -> List[Dict]:
        """Retrieve audit trail for patient record."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            if record_id:
                cursor.execute('''
                    SELECT * FROM audit_log 
                    WHERE patient_id = ? AND record_id = ?
                    ORDER BY timestamp DESC
                ''', (patient_id, record_id))
            else:
                cursor.execute('''
                    SELECT * FROM audit_log 
                    WHERE patient_id = ?
                    ORDER BY timestamp DESC
                ''', (patient_id,))
            
            rows = cursor.fetchall()
            conn.close()
            
            audit_entries = [dict(row) for row in rows]
            logger.info(f"Retrieved {len(audit_entries)} audit entries for patient {patient_id}")
            return audit_entries
        except Exception as e:
            logger.error(f"Failed to retrieve audit trail: {str(e)}")
            raise


class AccessControl:
    """HIPAA-compliant access control for medical records."""
    
    @staticmethod
    def check_provider_access(user_id: str, provider_role: str, patient_id: str) -> Tuple[bool, str]:
        """Check if provider has valid access to patient record."""
        # Validate provider role
        if provider_role not in HIPAAConfig.VALID_ROLES:
            logger.warning(f"Invalid provider role: {provider_role}")
            return False, f"Invalid provider role: {provider_role}"
        
        # Check user ID format (should be valid)
        if not user_id or len(str(user_id)) < 3:
            logger.warning(f"Invalid user ID format: {user_id}")
            return False, "Invalid user ID format"
        
        # Check patient ID format
        if not patient_id or len(str(patient_id)) < 3:
            logger.warning(f"Invalid patient ID format: {patient_id}")
            return False, "Invalid patient ID format"
        
        # Role-based access control (RBAC)
        # All valid roles can access records (in real system, would check patient consent)
        logger.info(f"Access granted: {user_id} ({provider_role}) accessing patient {patient_id}")
        return True, "Access granted"
    
    @staticmethod
    def validate_record_data(data: Dict) -> Tuple[bool, str]:
        """Validate medical record data integrity and format."""
        required_fields = ['patient_id', 'record_type', 'provider_id']
        
        for field in required_fields:
            if field not in data or not data[field]:
                return False, f"Missing required field: {field}"
        
        # Validate medical record type
        valid_types = ['diagnosis', 'treatment', 'lab_result', 'imaging', 'vital_signs', 'prescription', 'note']
        if data.get('record_type') not in valid_types:
            return False, f"Invalid record type: {data.get('record_type')}"
        
        # Validate patient ID format (typically numeric or alphanumeric)
        patient_id = str(data.get('patient_id', ''))
        if not patient_id.isalnum() or len(patient_id) < 3:
            return False, "Invalid patient ID format"
        
        # Validate provider ID
        provider_id = str(data.get('provider_id', ''))
        if not provider_id.isalnum() or len(provider_id) < 3:
            return False, "Invalid provider ID format"
        
        # Validate content if present
        if 'content' in data and data['content']:
            content = str(data['content'])
            if len(content) > 50000:  # 50KB limit per record
                return False, "Record content exceeds maximum size"
        
        logger.info(f"Record validation successful for patient {data.get('patient_id')}")
        return True, "Validation successful"


class MedicalRecordDB:
    """Medical records database management with version control."""
    
    def __init__(self):
        """Initialize medical records database."""
        self.db_path = os.getenv('RECORDS_DB_PATH', '/tmp/medical_records.db')
        self.encryption = RecordEncryption()
        self.audit = AuditLog()
        self._init_records_db()
    
    def _init_records_db(self):
        """Initialize medical records database with version control schema."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Main records table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS medical_records (
                    id TEXT PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content_encrypted TEXT NOT NULL,
                    metadata TEXT,
                    version INTEGER DEFAULT 1,
                    is_active BOOLEAN DEFAULT 1,
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    modified_by TEXT,
                    modified_at TIMESTAMP
                )
            ''')
            
            # Version history table for record versioning
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS record_versions (
                    id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    content_encrypted TEXT NOT NULL,
                    modified_by TEXT NOT NULL,
                    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    change_summary TEXT,
                    FOREIGN KEY (record_id) REFERENCES medical_records(id)
                )
            ''')
            
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_patient ON medical_records(patient_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_record_type ON medical_records(record_type)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_provider ON medical_records(provider_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_active ON medical_records(is_active)')
            
            conn.commit()
            conn.close()
            logger.info("Medical records database initialized")
        except Exception as e:
            logger.error(f"Failed to initialize records database: {str(e)}")
            raise
    
    def store_record(self, patient_id: str, record_type: str, provider_id: str, 
                    title: str, content: str, user_id: str, metadata: Dict = None) -> Dict:
        """Store encrypted medical record with audit logging."""
        try:
            # Validate input data
            validation_passed, validation_msg = AccessControl.validate_record_data({
                'patient_id': patient_id,
                'record_type': record_type,
                'provider_id': provider_id,
                'content': content
            })
            
            if not validation_passed:
                logger.error(f"Validation failed: {validation_msg}")
                return {
                    'success': False,
                    'error': validation_msg,
                    'record_id': None
                }
            
            # Encrypt sensitive content
            try:
                encrypted_content = self.encryption.encrypt_phi(content)
            except Exception as e:
                logger.error(f"Encryption failed: {str(e)}")
                return {
                    'success': False,
                    'error': 'Failed to encrypt record content',
                    'record_id': None
                }
            
            record_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO medical_records 
                (id, patient_id, record_type, provider_id, title, 
                 content_encrypted, metadata, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (record_id, patient_id, record_type, provider_id, title,
                  encrypted_content, json.dumps(metadata or {}), user_id, timestamp))
            
            conn.commit()
            conn.close()
            
            # Audit log the creation
            self.audit.log_access(user_id, 'physician', patient_id, record_id,
                                 'RECORD_CREATED', 'CREATE', 'SUCCESS',
                                 f'Record created: {title}')
            
            logger.info(f"Medical record stored: {record_id} for patient {patient_id}")
            
            return {
                'success': True,
                'record_id': record_id,
                'patient_id': patient_id,
                'record_type': record_type,
                'title': title,
                'created_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error storing record: {str(e)}")
            return {
                'success': False,
                'error': 'Error storing medical record',
                'record_id': None
            }
    
    def retrieve_record(self, record_id: str, patient_id: str, user_id: str, 
                       provider_role: str = 'physician') -> Dict:
        """Retrieve and decrypt medical record with access control."""
        try:
            # Check access
            access_granted, access_msg = AccessControl.check_provider_access(
                user_id, provider_role, patient_id)
            
            if not access_granted:
                self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                     'ACCESS_DENIED', 'RETRIEVE', 'DENIED', access_msg)
                logger.warning(f"Access denied for {user_id}: {access_msg}")
                return {
                    'success': False,
                    'error': 'Unauthorized access',
                    'record': None
                }
            
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM medical_records 
                WHERE id = ? AND patient_id = ? AND is_active = 1
            ''', (record_id, patient_id))
            
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                     'RECORD_RETRIEVED', 'RETRIEVE', 'NOT_FOUND')
                logger.warning(f"Record not found: {record_id}")
                return {
                    'success': False,
                    'error': 'Record not found',
                    'record': None
                }
            
            # Decrypt content
            try:
                decrypted_content = self.encryption.decrypt_phi(row['content_encrypted'])
            except Exception as e:
                logger.error(f"Decryption failed: {str(e)}")
                return {
                    'success': False,
                    'error': 'Failed to decrypt record',
                    'record': None
                }
            
            # Audit log the access
            self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                 'RECORD_RETRIEVED', 'RETRIEVE', 'SUCCESS')
            
            record = {
                'id': row['id'],
                'patient_id': row['patient_id'],
                'record_type': row['record_type'],
                'provider_id': row['provider_id'],
                'title': row['title'],
                'content': decrypted_content,
                'version': row['version'],
                'created_at': row['created_at'],
                'modified_at': row['modified_at']
            }
            
            logger.info(f"Record retrieved successfully: {record_id}")
            return {
                'success': True,
                'record': record
            }
        
        except Exception as e:
            logger.error(f"Error retrieving record: {str(e)}")
            return {
                'success': False,
                'error': 'Error retrieving medical record',
                'record': None
            }
    
    def update_record(self, record_id: str, patient_id: str, user_id: str,
                     content: str, change_summary: str = None,
                     provider_role: str = 'physician') -> Dict:
        """Update medical record with version control and audit logging."""
        try:
            # Check access
            access_granted, access_msg = AccessControl.check_provider_access(
                user_id, provider_role, patient_id)
            
            if not access_granted:
                self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                     'ACCESS_DENIED', 'UPDATE', 'DENIED', access_msg)
                return {
                    'success': False,
                    'error': 'Unauthorized access'
                }
            
            # Encrypt new content
            try:
                encrypted_content = self.encryption.encrypt_phi(content)
            except Exception as e:
                logger.error(f"Encryption failed: {str(e)}")
                return {
                    'success': False,
                    'error': 'Failed to encrypt record content'
                }
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get current version
            cursor.execute('SELECT version FROM medical_records WHERE id = ? AND patient_id = ?',
                          (record_id, patient_id))
            row = cursor.fetchone()
            
            if not row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Record not found'
                }
            
            current_version = row[0]
            new_version = current_version + 1
            timestamp = datetime.utcnow().isoformat()
            
            # Store version history
            version_id = str(uuid.uuid4())
            cursor.execute('''
                INSERT INTO record_versions 
                (id, record_id, version, content_encrypted, modified_by, change_summary)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (version_id, record_id, current_version, 
                  self.encryption.encrypt_phi(content), user_id, change_summary))
            
            # Update main record
            cursor.execute('''
                UPDATE medical_records 
                SET content_encrypted = ?, version = ?, modified_by = ?, modified_at = ?
                WHERE id = ? AND patient_id = ?
            ''', (encrypted_content, new_version, user_id, timestamp, record_id, patient_id))
            
            conn.commit()
            conn.close()
            
            # Audit log the update
            self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                 'RECORD_MODIFIED', 'UPDATE', 'SUCCESS',
                                 f'Updated to version {new_version}')
            
            logger.info(f"Record updated: {record_id} to version {new_version}")
            return {
                'success': True,
                'record_id': record_id,
                'version': new_version,
                'updated_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error updating record: {str(e)}")
            return {
                'success': False,
                'error': 'Error updating medical record'
            }
    
    def delete_record(self, record_id: str, patient_id: str, user_id: str,
                     provider_role: str = 'physician') -> Dict:
        """Delete (soft delete) medical record with audit logging."""
        try:
            # Check access
            access_granted, access_msg = AccessControl.check_provider_access(
                user_id, provider_role, patient_id)
            
            if not access_granted:
                self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                     'ACCESS_DENIED', 'DELETE', 'DENIED', access_msg)
                return {
                    'success': False,
                    'error': 'Unauthorized access'
                }
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Soft delete (mark as inactive)
            cursor.execute('''
                UPDATE medical_records 
                SET is_active = 0, modified_by = ?, modified_at = ?
                WHERE id = ? AND patient_id = ?
            ''', (user_id, datetime.utcnow().isoformat(), record_id, patient_id))
            
            conn.commit()
            conn.close()
            
            # Audit log the deletion
            self.audit.log_access(user_id, provider_role, patient_id, record_id,
                                 'RECORD_DELETED', 'DELETE', 'SUCCESS')
            
            logger.info(f"Record deleted (soft): {record_id}")
            return {
                'success': True,
                'record_id': record_id,
                'deleted_at': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Error deleting record: {str(e)}")
            return {
                'success': False,
                'error': 'Error deleting medical record'
            }
    
    def get_audit_trail(self, patient_id: str, record_id: str = None, 
                       user_id: str = None) -> Dict:
        """Retrieve HIPAA audit trail for compliance reporting."""
        try:
            audit_entries = self.audit.get_audit_trail(patient_id, record_id)
            
            logger.info(f"Audit trail retrieved for patient {patient_id}: {len(audit_entries)} entries")
            return {
                'success': True,
                'patient_id': patient_id,
                'record_id': record_id,
                'total_entries': len(audit_entries),
                'audit_trail': audit_entries,
                'generated_at': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Error retrieving audit trail: {str(e)}")
            return {
                'success': False,
                'error': 'Error retrieving audit trail',
                'audit_trail': []
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
    """Main plugin execution function for medical records management."""
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

        db = MedicalRecordDB()
        result = None

        # Store encrypted medical record
        if action == 'store_record':
            patient_id = _get_input(payload, 'patient_id')
            record_type = _get_input(payload, 'record_type')
            provider_id = _get_input(payload, 'provider_id')
            title = _get_input(payload, 'title')
            content = _get_input(payload, 'content')
            user_id = _get_input(payload, 'user_id')
            metadata = _get_input(payload, 'metadata', default={})

            if not all([patient_id, record_type, provider_id, title, content, user_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: patient_id, record_type, provider_id, title, content, user_id"
                }]

            result = db.store_record(patient_id, record_type, provider_id, title, 
                                    content, user_id, metadata)

        # Retrieve encrypted medical record
        elif action == 'retrieve_record':
            record_id = _get_input(payload, 'record_id')
            patient_id = _get_input(payload, 'patient_id')
            user_id = _get_input(payload, 'user_id')
            provider_role = _get_input(payload, 'provider_role', default='physician')

            if not all([record_id, patient_id, user_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: record_id, patient_id, user_id"
                }]

            result = db.retrieve_record(record_id, patient_id, user_id, provider_role)

        # Update medical record with versioning
        elif action == 'update_record':
            record_id = _get_input(payload, 'record_id')
            patient_id = _get_input(payload, 'patient_id')
            user_id = _get_input(payload, 'user_id')
            content = _get_input(payload, 'content')
            change_summary = _get_input(payload, 'change_summary')
            provider_role = _get_input(payload, 'provider_role', default='physician')

            if not all([record_id, patient_id, user_id, content]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: record_id, patient_id, user_id, content"
                }]

            result = db.update_record(record_id, patient_id, user_id, content, 
                                     change_summary, provider_role)

        # Delete medical record (soft delete)
        elif action == 'delete_record':
            record_id = _get_input(payload, 'record_id')
            patient_id = _get_input(payload, 'patient_id')
            user_id = _get_input(payload, 'user_id')
            provider_role = _get_input(payload, 'provider_role', default='physician')

            if not all([record_id, patient_id, user_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: record_id, patient_id, user_id"
                }]

            result = db.delete_record(record_id, patient_id, user_id, provider_role)

        # Retrieve audit trail for compliance
        elif action == 'get_audit_trail':
            patient_id = _get_input(payload, 'patient_id')
            record_id = _get_input(payload, 'record_id')
            user_id = _get_input(payload, 'user_id')

            if not patient_id:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required field: patient_id"
                }]

            result = db.get_audit_trail(patient_id, record_id, user_id)

        # Check access control
        elif action == 'check_access':
            user_id = _get_input(payload, 'user_id')
            provider_role = _get_input(payload, 'provider_role')
            patient_id = _get_input(payload, 'patient_id')

            if not all([user_id, provider_role, patient_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: user_id, provider_role, patient_id"
                }]

            access_granted, access_msg = AccessControl.check_provider_access(
                user_id, provider_role, patient_id)
            result = {
                'success': access_granted,
                'user_id': user_id,
                'patient_id': patient_id,
                'provider_role': provider_role,
                'message': access_msg
            }

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
            "result": "Plugin execution failed",
            "error": str(e)
        }]
        print(json.dumps(result))


if __name__ == "__main__":
    main()
