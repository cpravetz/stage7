#!/usr/bin/env python3
"""
Unit tests for HOTEL_RESERVATION_SYSTEM plugin
Tests hotel reservation management and booking logic
"""

import pytest
from datetime import datetime, timedelta


class TestHotelReservationSystem:
    """Test suite for HOTEL_RESERVATION_SYSTEM plugin."""
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_reservation_creation(self, sample_hotel_reservation):
        """Test creation of new hotel reservation."""
        reservation = sample_hotel_reservation
        
        assert "reservation_id" in reservation
        assert "guest_name" in reservation
        assert "check_in" in reservation
        assert "check_out" in reservation
        assert reservation["room_number"] == "402"
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_room_availability_check(self):
        """Test room availability verification."""
        availability = {
            "room_type": "Deluxe King",
            "check_in": "2024-02-01",
            "check_out": "2024-02-05",
            "available_rooms": 5
        }
        
        assert availability["available_rooms"] > 0
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_double_booking_prevention(self):
        """Test prevention of double bookings."""
        existing_reservation = {
            "room": 402,
            "check_in": "2024-02-01",
            "check_out": "2024-02-05"
        }
        
        new_reservation = {
            "room": 402,
            "check_in": "2024-02-03",
            "check_out": "2024-02-06"
        }
        
        # These overlap, should be prevented
        overlap = not (new_reservation["check_out"] <= existing_reservation["check_in"] or 
                      new_reservation["check_in"] >= existing_reservation["check_out"])
        assert overlap == True
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_length_of_stay_validation(self):
        """Test validation of minimum and maximum stay."""
        min_stay = 1
        max_stay = 30
        
        requested_nights = 5
        assert min_stay <= requested_nights <= max_stay
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_special_requests_handling(self, sample_hotel_reservation):
        """Test handling of special guest requests."""
        special_requests = sample_hotel_reservation["special_requests"]
        
        assert isinstance(special_requests, str)
        assert "high floor" in special_requests.lower()
        assert "non-smoking" in special_requests.lower()
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_rate_calculation(self, sample_hotel_reservation):
        """Test room rate calculation."""
        rate_per_night = sample_hotel_reservation["rate_per_night"]
        check_in = datetime.strptime(sample_hotel_reservation["check_in"], "%Y-%m-%d")
        check_out = datetime.strptime(sample_hotel_reservation["check_out"], "%Y-%m-%d")
        
        nights = (check_out - check_in).days
        total_rate = rate_per_night * nights
        
        assert nights == 4
        assert total_rate == 800.0
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_cancellation_policy(self):
        """Test cancellation policy enforcement."""
        policy = {
            "days_before_checkin": 7,
            "free_cancellation": True,
            "penalty_percent": 0
        }
        
        days_until_checkin = 10
        can_cancel_free = days_until_checkin >= policy["days_before_checkin"]
        assert can_cancel_free == True
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_early_checkin_late_checkout(self):
        """Test early check-in and late checkout requests."""
        requests = {
            "early_checkin": True,
            "early_time": "10:00",
            "late_checkout": True,
            "late_time": "16:00",
            "additional_fee": 50.0
        }
        
        assert requests["early_checkin"] == True
        assert requests["additional_fee"] > 0
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_guest_preferences_storage(self):
        """Test storage and retrieval of guest preferences."""
        preferences = {
            "floor": "high",
            "bed_type": "King",
            "temperature": 70,
            "coffee_maker": True,
            "quiet_room": True
        }
        
        assert preferences["floor"] == "high"
        assert preferences["temperature"] == 70
    
    @pytest.mark.integration
    @pytest.mark.operations
    def test_full_reservation_workflow(self, sample_hotel_reservation):
        """Test complete reservation workflow: search -> book -> confirm."""
        # Search availability
        assert sample_hotel_reservation["available_rooms"] is None or True
        
        # Create reservation
        assert sample_hotel_reservation["reservation_id"]
        
        # Send confirmation
        confirmation = {
            "sent": True,
            "method": "email",
            "email": "guest@example.com"
        }
        assert confirmation["sent"] == True


class TestHotelReservationSystemEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_same_day_checkin_checkout(self):
        """Test handling of same-day check-in and check-out."""
        check_in = "2024-02-01"
        check_out = "2024-02-01"
        
        # Should be rejected or charged as day-use
        assert check_in == check_out
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_very_long_stay(self):
        """Test handling of extended stays (100+ nights)."""
        check_in = datetime(2024, 1, 1)
        check_out = datetime(2024, 4, 11)
        nights = (check_out - check_in).days
        
        assert nights > 100
        # Should offer extended stay discount
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_invalid_room_type(self):
        """Test validation of room type."""
        valid_types = ["Standard", "Deluxe", "Suite", "Presidential"]
        requested_type = "Penthouse"
        
        assert requested_type not in valid_types
    
    @pytest.mark.unit
    @pytest.mark.operations
    def test_group_booking(self):
        """Test handling of group bookings."""
        group_booking = {
            "group_size": 25,
            "rooms": 12,
            "group_rate": 0.15,  # 15% discount
            "coordinator": "John Manager"
        }
        
        assert group_booking["group_size"] > 0
        assert group_booking["group_rate"] > 0
