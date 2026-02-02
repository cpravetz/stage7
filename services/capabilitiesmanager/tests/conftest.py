#!/usr/bin/env python3
"""
Global pytest configuration and fixtures for plugin testing
"""

import pytest
import sys
import os
import json
from pathlib import Path
from typing import Dict, Any, Generator
from unittest.mock import MagicMock, patch

# Add parent directory to path for plugin imports
PLUGINS_PATH = Path(__file__).parent.parent / "src" / "plugins"
sys.path.insert(0, str(PLUGINS_PATH.parent))


@pytest.fixture(scope="session")
def plugins_dir() -> Path:
    """Get the plugins directory path."""
    return PLUGINS_PATH


@pytest.fixture(scope="session")
def test_data_dir() -> Path:
    """Get the test data directory path."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def mock_logger():
    """Provide a mock logger for testing."""
    return MagicMock()


@pytest.fixture
def sample_inputs() -> Dict[str, Any]:
    """Provide sample inputs for testing."""
    return {
        "action": "test_action",
        "payload": {
            "test_key": "test_value"
        },
        "user_id": "test_user_123",
        "session_id": "test_session_456"
    }


@pytest.fixture
def mock_yfinance(monkeypatch):
    """Mock yfinance module for finance plugin tests."""
    mock_yf = MagicMock()
    
    # Mock historical data
    mock_hist_data = MagicMock()
    mock_hist_data.loc = {
        "Close": MagicMock(),
        "Volume": MagicMock()
    }
    
    # Mock Ticker
    mock_ticker = MagicMock()
    mock_ticker.history.return_value = mock_hist_data
    mock_ticker.info = {
        "regularMarketPrice": 150.0,
        "marketCap": 3000000000000,
        "fiftyTwoWeekHigh": 160.0,
        "fiftyTwoWeekLow": 130.0,
        "dividendRate": 3.0
    }
    
    mock_yf.Ticker.return_value = mock_ticker
    mock_yf.download.return_value = mock_hist_data
    
    monkeypatch.setitem(sys.modules, 'yfinance', mock_yf)
    return mock_yf


@pytest.fixture
def mock_pandas(monkeypatch):
    """Mock pandas for data manipulation tests."""
    mock_pd = MagicMock()
    
    # Mock DataFrame
    mock_df = MagicMock()
    mock_df.describe.return_value = MagicMock()
    mock_df.corr.return_value = MagicMock()
    mock_df.mean.return_value = MagicMock()
    
    mock_pd.DataFrame.return_value = mock_df
    
    monkeypatch.setitem(sys.modules, 'pandas', mock_pd)
    return mock_pd


@pytest.fixture
def mock_numpy(monkeypatch):
    """Mock numpy for numerical operations."""
    mock_np = MagicMock()
    mock_np.array = list
    mock_np.mean = lambda x: sum(x) / len(x)
    mock_np.std = lambda x: (sum((i - (sum(x) / len(x)))**2 for i in x) / len(x))**0.5
    
    monkeypatch.setitem(sys.modules, 'numpy', mock_np)
    return mock_np


@pytest.fixture
def mock_requests(monkeypatch):
    """Mock requests for API calls."""
    mock_req = MagicMock()
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"success": True, "data": {}}
    mock_response.text = '{"success": true}'
    
    mock_req.get.return_value = mock_response
    mock_req.post.return_value = mock_response
    mock_req.put.return_value = mock_response
    mock_req.delete.return_value = mock_response
    
    monkeypatch.setitem(sys.modules, 'requests', mock_req)
    return mock_req


@pytest.fixture
def mock_cryptography(monkeypatch):
    """Mock cryptography module for encryption tests."""
    mock_crypto = MagicMock()
    
    # Mock Fernet
    mock_fernet = MagicMock()
    mock_fernet.encrypt.return_value = b'encrypted_data'
    mock_fernet.decrypt.return_value = b'decrypted_data'
    
    mock_crypto.Fernet = MagicMock(return_value=mock_fernet)
    mock_crypto.Fernet.generate_key = MagicMock(return_value=b'test_key_123')
    
    monkeypatch.setitem(sys.modules, 'cryptography.fernet', MagicMock(Fernet=mock_crypto.Fernet))
    return mock_crypto


@pytest.fixture
def sample_ticker_data() -> Dict[str, Any]:
    """Sample financial ticker data for testing."""
    return {
        "symbol": "AAPL",
        "close": 150.0,
        "volume": 50000000,
        "high": 152.0,
        "low": 148.0,
        "open": 151.0,
        "date": "2024-01-15"
    }


@pytest.fixture
def sample_patient_data() -> Dict[str, Any]:
    """Sample healthcare patient data for testing."""
    return {
        "patient_id": "P123456",
        "name": "John Doe",
        "dob": "1990-01-15",
        "medical_record_number": "MRN123",
        "allergies": ["Penicillin", "Aspirin"],
        "medications": [
            {"name": "Lisinopril", "dosage": "10mg", "frequency": "daily"}
        ],
        "conditions": ["Hypertension", "Diabetes Type 2"],
        "vital_signs": {
            "blood_pressure": "120/80",
            "heart_rate": 72,
            "temperature": 98.6
        }
    }


@pytest.fixture
def sample_legal_document() -> Dict[str, Any]:
    """Sample legal document for testing."""
    return {
        "doc_id": "DOC001",
        "title": "Service Agreement",
        "content": """
        SERVICE AGREEMENT
        
        This Service Agreement ("Agreement") is entered into as of January 1, 2024
        between Provider ("Company") and Client ("Customer").
        
        1. SERVICES
        The Company agrees to provide software development services as requested.
        
        2. PAYMENT TERMS
        Invoice due within 30 days of service delivery.
        
        3. CONFIDENTIALITY
        All proprietary information shall be kept confidential.
        
        4. LIABILITY
        Company liability limited to contract value.
        
        5. TERMINATION
        Either party may terminate with 30 days written notice.
        """,
        "created_date": "2024-01-01",
        "parties": ["Company A", "Customer B"]
    }


@pytest.fixture
def sample_resume() -> Dict[str, Any]:
    """Sample resume for career plugin testing."""
    return {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "phone": "555-1234",
        "summary": "Senior Software Engineer with 8 years experience",
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "Tech Corp",
                "duration": "2020-2024",
                "achievements": ["Led 5-person team", "30% performance improvement"]
            }
        ],
        "skills": ["Python", "TypeScript", "React", "AWS", "Docker"],
        "education": [
            {
                "degree": "BS Computer Science",
                "school": "State University",
                "year": 2016
            }
        ]
    }


@pytest.fixture
def sample_hotel_reservation() -> Dict[str, Any]:
    """Sample hotel reservation for operations testing."""
    return {
        "reservation_id": "RES123",
        "guest_name": "John Traveler",
        "check_in": "2024-02-01",
        "check_out": "2024-02-05",
        "room_type": "Deluxe King",
        "room_number": "402",
        "guests": 2,
        "special_requests": "High floor, non-smoking",
        "rate_per_night": 200.0
    }


@pytest.fixture
def sample_restaurant_order() -> Dict[str, Any]:
    """Sample restaurant order for operations testing."""
    return {
        "order_id": "ORD001",
        "table_number": 5,
        "timestamp": "2024-01-15T19:30:00",
        "items": [
            {"name": "Caesar Salad", "quantity": 2, "price": 12.99},
            {"name": "Grilled Salmon", "quantity": 2, "price": 28.99},
            {"name": "House Wine", "quantity": 1, "price": 35.00}
        ],
        "special_requests": "No croutons on salad",
        "server": "Sarah"
    }


@pytest.fixture
def mock_database():
    """Mock database connection and operations."""
    mock_db = MagicMock()
    
    # Mock query execution
    mock_db.execute.return_value = [(1, "test"), (2, "data")]
    mock_db.insert.return_value = {"inserted_id": 123, "inserted_at": "2024-01-15"}
    mock_db.update.return_value = {"updated_count": 1}
    mock_db.delete.return_value = {"deleted_count": 1}
    
    # Mock transaction context
    mock_db.transaction = MagicMock()
    mock_db.transaction.__enter__ = MagicMock(return_value=mock_db)
    mock_db.transaction.__exit__ = MagicMock(return_value=None)
    
    return mock_db


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers."""
    for item in items:
        if "unit" in item.nodeid:
            item.add_marker(pytest.mark.unit)
        if "integration" in item.nodeid:
            item.add_marker(pytest.mark.integration)
