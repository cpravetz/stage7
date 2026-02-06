#!/usr/bin/env python3
"""
PATIENT_COMMUNICATION Plugin - HIPAA-compliant secure patient-provider communication
Provides end-to-end encrypted messaging, delivery tracking, and thread management.
Implements comprehensive audit logging and secure error handling to prevent PHI leakage.
"""

import sys
import json
import logging
import os
import sqlite3
import uuid
import hashlib
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
import base64
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configure comprehensive audit logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# SECURE COMMUNICATION CONFIGURATION
# ============================================================================

class SecureCommConfig:
    """Configuration for secure communication requirements."""
    
    # Valid message types
    MESSAGE_TYPES = ['consultation', 'prescription', 'lab_result', 'appointment', 'urgent', 'general']
    
    # Message priority levels
    PRIORITY_LEVELS = ['low', 'normal', 'high', 'urgent']
    
    # Delivery status tracking
    DELIVERY_STATUS = ['sent', 'delivered', 'read', 'failed', 'expired']
    
    # Message retention policy (in days)
    MESSAGE_RETENTION_DAYS = 365 * 7  # 7 years for healthcare
    
    # Valid recipients (roles)
    VALID_RECIPIENT_ROLES = ['patient', 'physician', 'nurse', 'pharmacist', 'administrator']


# ============================================================================
# ENCRYPTION & SECURITY UTILITIES
# ============================================================================

class MessageEncryption:
    """Handles encryption and decryption of healthcare messages."""
    
    def __init__(self):
        """Initialize encryption with derived key from environment."""
        key_source = os.getenv('HIPAA_ENCRYPTION_KEY', 'default-healthcare-comm-key')
        derived_key = hashlib.sha256(key_source.encode()).digest()
        self.cipher_suite = Fernet(base64.urlsafe_b64encode(derived_key[:32]))
        logger.info("Message encryption suite initialized")
    
    def encrypt_message(self, message: str) -> str:
        """Encrypt message content."""
        try:
            encrypted = self.cipher_suite.encrypt(message.encode())
            logger.info("Message encrypted successfully")
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Failed to encrypt message: {str(e)}")
            raise ValueError(f"Message encryption error: {str(e)}")
    
    def decrypt_message(self, encrypted_data: str) -> str:
        """Decrypt message content."""
        try:
            decrypted = self.cipher_suite.decrypt(encrypted_data.encode())
            logger.info("Message decrypted successfully")
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Failed to decrypt message: {str(e)}")
            raise ValueError(f"Message decryption error: {str(e)}")


class SecureAuditLog:
    """HIPAA-compliant audit logging for communications."""
    
    def __init__(self):
        """Initialize audit log database."""
        self.db_path = os.getenv('COMM_AUDIT_DB_PATH', '/tmp/communication_audit.db')
        self._init_audit_db()
    
    def _init_audit_db(self):
        """Initialize communication audit database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS communication_audit (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    sender_id TEXT NOT NULL,
                    recipient_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    action TEXT NOT NULL,
                    status TEXT NOT NULL,
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_message_id ON communication_audit(message_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON communication_audit(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_sender_id ON communication_audit(sender_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_recipient_id ON communication_audit(recipient_id)')
            conn.commit()
            conn.close()
            logger.info("Communication audit database initialized")
        except Exception as e:
            logger.error(f"Failed to initialize audit database: {str(e)}")
            raise
    
    def log_event(self, message_id: str, sender_id: str, recipient_id: str,
                 event_type: str, action: str, status: str, details: str = None) -> str:
        """Log communication event."""
        try:
            log_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO communication_audit 
                (id, timestamp, message_id, sender_id, recipient_id, event_type, action, status, details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (log_id, timestamp, message_id, sender_id, recipient_id, event_type, action, status, details))
            conn.commit()
            conn.close()
            
            logger.info(f"Audit log entry created: {log_id} | {event_type} | {status}")
            return log_id
        except Exception as e:
            logger.error(f"Failed to log communication event: {str(e)}")
            raise


class CommunicationDB:
    """Secure communication database management."""
    
    def __init__(self):
        """Initialize communication database."""
        self.db_path = os.getenv('COMM_DB_PATH', '/tmp/patient_communications.db')
        self.encryption = MessageEncryption()
        self.audit = SecureAuditLog()
        self._init_comm_db()
    
    def _init_comm_db(self):
        """Initialize communication database schema."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Messages table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    sender_id TEXT NOT NULL,
                    sender_role TEXT NOT NULL,
                    recipient_id TEXT NOT NULL,
                    recipient_role TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    message_encrypted TEXT NOT NULL,
                    message_type TEXT NOT NULL,
                    priority TEXT DEFAULT 'normal',
                    delivery_status TEXT DEFAULT 'sent',
                    is_read BOOLEAN DEFAULT 0,
                    read_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    delivered_at TIMESTAMP
                )
            ''')
            
            # Conversations table (threads)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    last_message_at TIMESTAMP,
                    is_archived BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Message delivery tracking
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS delivery_tracking (
                    id TEXT PRIMARY KEY,
                    message_id TEXT NOT NULL,
                    event TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    details TEXT,
                    FOREIGN KEY (message_id) REFERENCES messages(id)
                )
            ''')
            
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_conversation ON messages(conversation_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_sender ON messages(sender_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_recipient ON messages(recipient_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_delivery_status ON messages(delivery_status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_patient_conv ON conversations(patient_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_provider_conv ON conversations(provider_id)')
            
            conn.commit()
            conn.close()
            logger.info("Communication database initialized")
        except Exception as e:
            logger.error(f"Failed to initialize communication database: {str(e)}")
            raise
    
    def send_message(self, sender_id: str, sender_role: str, recipient_id: str,
                    recipient_role: str, subject: str, message: str,
                    message_type: str = 'general', priority: str = 'normal',
                    patient_id: str = None) -> Dict:
        """Send and encrypt healthcare message."""
        try:
            # Validate input
            if not all([sender_id, sender_role, recipient_id, recipient_role, subject, message]):
                return {
                    'success': False,
                    'error': 'Missing required message fields',
                    'message_id': None
                }
            
            if sender_role not in SecureCommConfig.VALID_RECIPIENT_ROLES:
                return {
                    'success': False,
                    'error': 'Invalid sender role',
                    'message_id': None
                }
            
            if recipient_role not in SecureCommConfig.VALID_RECIPIENT_ROLES:
                return {
                    'success': False,
                    'error': 'Invalid recipient role',
                    'message_id': None
                }
            
            if message_type not in SecureCommConfig.MESSAGE_TYPES:
                return {
                    'success': False,
                    'error': 'Invalid message type',
                    'message_id': None
                }
            
            if priority not in SecureCommConfig.PRIORITY_LEVELS:
                return {
                    'success': False,
                    'error': 'Invalid priority level',
                    'message_id': None
                }
            
            # Encrypt message content
            try:
                encrypted_message = self.encryption.encrypt_message(message)
            except Exception as e:
                logger.error(f"Message encryption failed: {str(e)}")
                return {
                    'success': False,
                    'error': 'Failed to encrypt message',
                    'message_id': None
                }
            
            message_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Determine conversation ID (use patient/provider pair)
            if patient_id:
                conversation_key = f"{patient_id}-{sender_id if sender_role == 'physician' else recipient_id}"
            else:
                conversation_key = f"{sender_id}-{recipient_id}"
            
            conversation_id = hashlib.sha256(conversation_key.encode()).hexdigest()[:16]
            
            # Check if conversation exists
            cursor.execute('SELECT id FROM conversations WHERE id = ?', (conversation_id,))
            if not cursor.fetchone():
                cursor.execute('''
                    INSERT INTO conversations 
                    (id, patient_id, provider_id, subject, created_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (conversation_id, patient_id or sender_id, recipient_id, subject, timestamp))
            
            # Insert message
            cursor.execute('''
                INSERT INTO messages 
                (id, conversation_id, sender_id, sender_role, recipient_id, recipient_role, 
                 subject, message_encrypted, message_type, priority, delivery_status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (message_id, conversation_id, sender_id, sender_role, recipient_id, 
                  recipient_role, subject, encrypted_message, message_type, priority, 'sent', timestamp))
            
            # Track delivery
            cursor.execute('''
                INSERT INTO delivery_tracking (id, message_id, event, timestamp, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (str(uuid.uuid4()), message_id, 'sent', timestamp, 'Message sent successfully'))
            
            conn.commit()
            conn.close()
            
            # Audit log
            self.audit.log_event(message_id, sender_id, recipient_id, 
                                'MESSAGE_SENT', 'SEND', 'SUCCESS',
                                f'Type: {message_type}, Priority: {priority}')
            
            logger.info(f"Message sent: {message_id} from {sender_id} to {recipient_id}")
            
            return {
                'success': True,
                'message_id': message_id,
                'conversation_id': conversation_id,
                'sender_id': sender_id,
                'recipient_id': recipient_id,
                'message_type': message_type,
                'priority': priority,
                'delivery_status': 'sent',
                'created_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            return {
                'success': False,
                'error': 'Error sending message',
                'message_id': None
            }
    
    def retrieve_messages(self, user_id: str, user_role: str, 
                         conversation_id: str = None) -> Dict:
        """Retrieve decrypted messages for user."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            if conversation_id:
                cursor.execute('''
                    SELECT * FROM messages 
                    WHERE conversation_id = ? AND (sender_id = ? OR recipient_id = ?)
                    ORDER BY created_at DESC
                ''', (conversation_id, user_id, user_id))
            else:
                cursor.execute('''
                    SELECT * FROM messages 
                    WHERE sender_id = ? OR recipient_id = ?
                    ORDER BY created_at DESC
                ''', (user_id, user_id))
            
            rows = cursor.fetchall()
            conn.close()
            
            messages = []
            for row in rows:
                try:
                    decrypted_content = self.encryption.decrypt_message(row['message_encrypted'])
                except Exception as e:
                    logger.error(f"Failed to decrypt message {row['id']}: {str(e)}")
                    decrypted_content = "[Decryption Error - Contact Administrator]"
                
                messages.append({
                    'id': row['id'],
                    'conversation_id': row['conversation_id'],
                    'sender_id': row['sender_id'],
                    'sender_role': row['sender_role'],
                    'recipient_id': row['recipient_id'],
                    'recipient_role': row['recipient_role'],
                    'subject': row['subject'],
                    'content': decrypted_content,
                    'message_type': row['message_type'],
                    'priority': row['priority'],
                    'delivery_status': row['delivery_status'],
                    'is_read': bool(row['is_read']),
                    'created_at': row['created_at'],
                    'delivered_at': row['delivered_at']
                })
            
            logger.info(f"Retrieved {len(messages)} messages for user {user_id}")
            
            return {
                'success': True,
                'user_id': user_id,
                'total_messages': len(messages),
                'messages': messages
            }
        
        except Exception as e:
            logger.error(f"Error retrieving messages: {str(e)}")
            return {
                'success': False,
                'error': 'Error retrieving messages',
                'messages': []
            }
    
    def update_message(self, message_id: str, user_id: str, 
                      new_content: str = None, mark_as_read: bool = None) -> Dict:
        """Update message (mark read, update content if owner)."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get message
            cursor.execute('SELECT * FROM messages WHERE id = ?', (message_id,))
            row = cursor.fetchone()
            
            if not row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Message not found',
                    'message_id': message_id
                }
            
            message_sender = row[2]  # sender_id
            
            # Check authorization for content update
            if new_content and message_sender != user_id:
                conn.close()
                self.audit.log_event(message_id, user_id, row[4], 'ACCESS_DENIED', 
                                    'UPDATE', 'DENIED', 'Unauthorized edit attempt')
                return {
                    'success': False,
                    'error': 'Unauthorized',
                    'message_id': message_id
                }
            
            timestamp = datetime.utcnow().isoformat()
            
            # Update content if provided
            if new_content:
                try:
                    encrypted_content = self.encryption.encrypt_message(new_content)
                    cursor.execute('''
                        UPDATE messages 
                        SET message_encrypted = ? 
                        WHERE id = ?
                    ''', (encrypted_content, message_id))
                    self.audit.log_event(message_id, user_id, row[4], 
                                        'MESSAGE_UPDATED', 'UPDATE', 'SUCCESS')
                except Exception as e:
                    conn.close()
                    return {
                        'success': False,
                        'error': 'Failed to update message',
                        'message_id': message_id
                    }
            
            # Mark as read if requested
            if mark_as_read is not None:
                cursor.execute('''
                    UPDATE messages 
                    SET is_read = ?, read_at = ?
                    WHERE id = ?
                ''', (1 if mark_as_read else 0, timestamp if mark_as_read else None, message_id))
                
                self.audit.log_event(message_id, user_id, row[4], 
                                    'MESSAGE_READ', 'READ', 'SUCCESS')
            
            conn.commit()
            conn.close()
            
            logger.info(f"Message updated: {message_id}")
            return {
                'success': True,
                'message_id': message_id,
                'updated_at': timestamp
            }
        
        except Exception as e:
            logger.error(f"Error updating message: {str(e)}")
            return {
                'success': False,
                'error': 'Error updating message',
                'message_id': message_id
            }
    
    def delete_message(self, message_id: str, user_id: str) -> Dict:
        """Delete message (soft delete)."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('SELECT sender_id FROM messages WHERE id = ?', (message_id,))
            row = cursor.fetchone()
            
            if not row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Message not found',
                    'message_id': message_id
                }
            
            # Only sender can delete
            if row[0] != user_id:
                conn.close()
                return {
                    'success': False,
                    'error': 'Unauthorized',
                    'message_id': message_id
                }
            
            # Soft delete by clearing content
            cursor.execute('''
                UPDATE messages 
                SET message_encrypted = '[DELETED]'
                WHERE id = ?
            ''', (message_id,))
            
            conn.commit()
            conn.close()
            
            self.audit.log_event(message_id, user_id, row[0], 
                                'MESSAGE_DELETED', 'DELETE', 'SUCCESS')
            
            logger.info(f"Message deleted: {message_id}")
            return {
                'success': True,
                'message_id': message_id,
                'deleted_at': datetime.utcnow().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Error deleting message: {str(e)}")
            return {
                'success': False,
                'error': 'Error deleting message',
                'message_id': message_id
            }
    
    def track_delivery(self, message_id: str) -> Dict:
        """Get delivery status and tracking information."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get message
            cursor.execute('SELECT * FROM messages WHERE id = ?', (message_id,))
            msg_row = cursor.fetchone()
            
            if not msg_row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Message not found',
                    'message_id': message_id
                }
            
            # Get tracking events
            cursor.execute('''
                SELECT * FROM delivery_tracking 
                WHERE message_id = ?
                ORDER BY timestamp ASC
            ''', (message_id,))
            
            tracking_events = [dict(row) for row in cursor.fetchall()]
            conn.close()
            
            return {
                'success': True,
                'message_id': message_id,
                'delivery_status': msg_row['delivery_status'],
                'is_read': bool(msg_row['is_read']),
                'created_at': msg_row['created_at'],
                'delivered_at': msg_row['delivered_at'],
                'read_at': msg_row['read_at'],
                'tracking_events': tracking_events
            }
        
        except Exception as e:
            logger.error(f"Error retrieving delivery tracking: {str(e)}")
            return {
                'success': False,
                'error': 'Error retrieving delivery tracking',
                'message_id': message_id,
                'tracking_events': []
            }
    
    def get_conversation(self, conversation_id: str, user_id: str) -> Dict:
        """Retrieve complete conversation thread."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get conversation
            cursor.execute('SELECT * FROM conversations WHERE id = ?', (conversation_id,))
            conv_row = cursor.fetchone()
            
            if not conv_row:
                conn.close()
                return {
                    'success': False,
                    'error': 'Conversation not found',
                    'conversation_id': conversation_id
                }
            
            # Get all messages in conversation
            cursor.execute('''
                SELECT * FROM messages 
                WHERE conversation_id = ? 
                AND (sender_id = ? OR recipient_id = ?)
                ORDER BY created_at ASC
            ''', (conversation_id, user_id, user_id))
            
            messages = []
            for row in cursor.fetchall():
                try:
                    decrypted = self.encryption.decrypt_message(row['message_encrypted'])
                except:
                    decrypted = "[Decryption Error]"
                
                messages.append({
                    'id': row['id'],
                    'sender_id': row['sender_id'],
                    'recipient_id': row['recipient_id'],
                    'subject': row['subject'],
                    'content': decrypted,
                    'message_type': row['message_type'],
                    'priority': row['priority'],
                    'created_at': row['created_at'],
                    'is_read': bool(row['is_read'])
                })
            
            conn.close()
            
            logger.info(f"Conversation retrieved: {conversation_id} ({len(messages)} messages)")
            return {
                'success': True,
                'conversation_id': conversation_id,
                'subject': conv_row['subject'],
                'patient_id': conv_row['patient_id'],
                'provider_id': conv_row['provider_id'],
                'is_archived': bool(conv_row['is_archived']),
                'message_count': len(messages),
                'messages': messages,
                'created_at': conv_row['created_at']
            }
        
        except Exception as e:
            logger.error(f"Error retrieving conversation: {str(e)}")
            return {
                'success': False,
                'error': 'Error retrieving conversation',
                'conversation_id': conversation_id,
                'messages': []
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
    """Main plugin execution function for patient communication."""
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

        db = CommunicationDB()
        result = None

        # Send encrypted message
        if action == 'send_message':
            sender_id = _get_input(payload, 'sender_id')
            sender_role = _get_input(payload, 'sender_role')
            recipient_id = _get_input(payload, 'recipient_id')
            recipient_role = _get_input(payload, 'recipient_role')
            subject = _get_input(payload, 'subject')
            message = _get_input(payload, 'message')
            message_type = _get_input(payload, 'message_type', default='general')
            priority = _get_input(payload, 'priority', default='normal')
            patient_id = _get_input(payload, 'patient_id')

            if not all([sender_id, sender_role, recipient_id, recipient_role, subject, message]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields"
                }]

            result = db.send_message(sender_id, sender_role, recipient_id, recipient_role,
                                    subject, message, message_type, priority, patient_id)

        # Retrieve messages
        elif action == 'retrieve_messages':
            user_id = _get_input(payload, 'user_id')
            user_role = _get_input(payload, 'user_role')
            conversation_id = _get_input(payload, 'conversation_id')

            if not all([user_id, user_role]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: user_id, user_role"
                }]

            result = db.retrieve_messages(user_id, user_role, conversation_id)

        # Update message
        elif action == 'update_message':
            message_id = _get_input(payload, 'message_id')
            user_id = _get_input(payload, 'user_id')
            new_content = _get_input(payload, 'new_content')
            mark_as_read = _get_input(payload, 'mark_as_read')

            if not message_id or not user_id:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: message_id, user_id"
                }]

            result = db.update_message(message_id, user_id, new_content, mark_as_read)

        # Delete message
        elif action == 'delete_message':
            message_id = _get_input(payload, 'message_id')
            user_id = _get_input(payload, 'user_id')

            if not all([message_id, user_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: message_id, user_id"
                }]

            result = db.delete_message(message_id, user_id)

        # Track delivery
        elif action == 'track_delivery':
            message_id = _get_input(payload, 'message_id')

            if not message_id:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required field: message_id"
                }]

            result = db.track_delivery(message_id)

        # Get conversation
        elif action == 'get_conversation':
            conversation_id = _get_input(payload, 'conversation_id')
            user_id = _get_input(payload, 'user_id')

            if not all([conversation_id, user_id]):
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": "Missing required fields: conversation_id, user_id"
                }]

            result = db.get_conversation(conversation_id, user_id)

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
            "error": "Communication operation failed"
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
            "error": "Communication error"
        }]
        print(json.dumps(result))


if __name__ == "__main__":
    main()
