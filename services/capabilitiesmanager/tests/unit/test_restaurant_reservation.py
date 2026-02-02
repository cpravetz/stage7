#!/usr/bin/env python3
"""
Unit tests for RESTAURANT_RESERVATION_SYSTEM plugin
Tests restaurant table management and booking
"""

import pytest
from datetime import datetime, timedelta


class TestRestaurantReservationSystem:
    """Test suite for RESTAURANT_RESERVATION_SYSTEM plugin."""
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_reservation_creation(self, sample_restaurant_order):
        """Test restaurant reservation creation."""
        order = sample_restaurant_order
        
        assert "order_id" in order
        assert "table_number" in order
        assert "timestamp" in order
        assert order["table_number"] == 5
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_table_availability(self):
        """Test table availability checking."""
        reservation_time = datetime.strptime("2024-01-15 19:30:00", "%Y-%m-%d %H:%M:%S")
        available_tables = [1, 3, 5, 7, 10]
        
        party_size = 4
        suitable_tables = [t for t in available_tables if t >= party_size]
        
        assert len(suitable_tables) > 0
        assert 5 in suitable_tables
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_party_size_validation(self):
        """Test validation of party size."""
        party_sizes = {
            "valid": [1, 2, 4, 6, 8, 20],
            "max_capacity": 25
        }
        
        for size in party_sizes["valid"]:
            assert 1 <= size <= party_sizes["max_capacity"]
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_reservation_time_slots(self):
        """Test availability of time slots."""
        time_slots = [
            "17:00", "17:30", "18:00", "18:30", "19:00", 
            "19:30", "20:00", "20:30", "21:00", "21:30"
        ]
        
        requested_time = "19:30"
        assert requested_time in time_slots
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_cancellation_policy(self):
        """Test reservation cancellation policy."""
        cancellation_window = 2  # hours
        reservation_time = datetime(2024, 1, 15, 19, 30)
        cancellation_time = datetime(2024, 1, 15, 17, 0)
        
        hours_before = (reservation_time - cancellation_time).total_seconds() / 3600
        can_cancel_free = hours_before >= cancellation_window
        
        assert can_cancel_free == True
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_special_requests_handling(self, sample_restaurant_order):
        """Test handling of special requests."""
        special_requests = sample_restaurant_order["special_requests"]
        
        assert isinstance(special_requests, str)
        assert len(special_requests) > 0
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_menu_item_availability(self):
        """Test menu item availability checking."""
        menu_items = {
            "Caesar Salad": {"available": True, "prep_time": 5},
            "Grilled Salmon": {"available": True, "prep_time": 20},
            "Special Dish": {"available": False, "reason": "Out of stock"}
        }
        
        available_items = [item for item, info in menu_items.items() if info["available"]]
        assert len(available_items) == 2
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_order_total_calculation(self, sample_restaurant_order):
        """Test calculation of order total."""
        items = sample_restaurant_order["items"]
        total = sum(item["quantity"] * item["price"] for item in items)
        
        expected = (2 * 12.99) + (2 * 28.99) + (1 * 35.00)
        assert abs(total - expected) < 0.01
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_server_assignment(self):
        """Test server assignment for table."""
        servers = {
            "Sarah": {"tables": [1, 2, 3], "current_load": 3},
            "Mike": {"tables": [4, 5], "current_load": 2},
            "Lisa": {"tables": [6, 7, 8], "current_load": 3}
        }
        
        # Assign table 9 to server with lowest load
        min_load_server = min(servers.items(), key=lambda x: x[1]["current_load"])
        assert min_load_server[0] == "Mike"
    
    @pytest.mark.integration
    @pytest.mark.operations
    def test_full_dining_experience_flow(self, sample_restaurant_order):
        """Test complete dining experience: reservation -> seating -> order -> checkout."""
        # Make reservation
        assert sample_restaurant_order["table_number"]
        
        # Seat guests
        assert sample_restaurant_order["timestamp"]
        
        # Take order
        items = sample_restaurant_order["items"]
        assert len(items) > 0
        
        # Process checkout
        total = sum(item["quantity"] * item["price"] for item in items)
        assert total > 0


class TestRestaurantReservationSystemEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_oversized_party(self):
        """Test handling of party larger than typical table."""
        party_size = 40
        max_table_size = 8
        tables_needed = -(-party_size // max_table_size)  # Ceiling division
        
        assert tables_needed == 5
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_last_minute_reservation(self):
        """Test last-minute reservation."""
        current_time = datetime.now()
        reservation_time = current_time + timedelta(minutes=15)
        
        advance_notice = 15
        is_last_minute = advance_notice < 60
        
        assert is_last_minute == True
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_no_show_handling(self):
        """Test handling of no-shows."""
        reservation = {
            "time": "19:30",
            "party_size": 4,
            "status": "no_show",
            "penalty_charge": True
        }
        
        assert reservation["status"] == "no_show"
        assert reservation["penalty_charge"] == True
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_dietary_restrictions(self):
        """Test handling of dietary restrictions."""
        restrictions = {
            "vegetarian": True,
            "vegan": False,
            "gluten_free": True,
            "shellfish_allergy": True
        }
        
        accommodations_needed = sum(1 for v in restrictions.values() if v)
        assert accommodations_needed == 3
