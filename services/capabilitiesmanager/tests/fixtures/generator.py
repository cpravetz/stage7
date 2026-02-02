#!/usr/bin/env python3
"""
Test fixtures and sample data for plugin testing
"""

import json
from pathlib import Path
from datetime import datetime, timedelta


class TestDataGenerator:
    """Generate realistic test data for plugins."""
    
    @staticmethod
    def generate_financial_data(num_assets=5, days=252):
        """Generate realistic financial market data."""
        import random
        
        tickers = [f"TICK{i:04d}" for i in range(num_assets)]
        prices = {ticker: 100.0 for ticker in tickers}
        
        historical_data = []
        current_date = datetime.now() - timedelta(days=days)
        
        for day in range(days):
            date = current_date + timedelta(days=day)
            day_data = {
                "date": date.isoformat(),
                "prices": {}
            }
            
            for ticker in tickers:
                # Simulate price movement
                change = random.uniform(-0.05, 0.05)
                prices[ticker] *= (1 + change)
                day_data["prices"][ticker] = round(prices[ticker], 2)
            
            historical_data.append(day_data)
        
        return {
            "tickers": tickers,
            "historical_data": historical_data[-30:]  # Return last 30 days
        }
    
    @staticmethod
    def generate_patient_records(num_patients=100):
        """Generate realistic patient medical records."""
        import random
        
        medications = [
            "Lisinopril", "Metformin", "Atorvastatin", "Aspirin",
            "Omeprazole", "Levothyroxine", "Metoprolol"
        ]
        
        conditions = [
            "Hypertension", "Diabetes Type 2", "Hyperlipidemia",
            "GERD", "Hypothyroidism", "CAD", "Asthma"
        ]
        
        allergies = [
            "Penicillin", "Aspirin", "Sulfonamides", "NSAIDs",
            "ACE Inhibitors", "Latex"
        ]
        
        records = []
        for i in range(num_patients):
            record = {
                "patient_id": f"P{100000+i}",
                "name": f"Patient {i}",
                "dob": f"19{random.randint(50,90)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                "medications": [
                    {
                        "name": random.choice(medications),
                        "dosage": f"{random.choice([10, 20, 50, 100, 500])}mg",
                        "frequency": random.choice(["once daily", "twice daily", "as needed"])
                    }
                    for _ in range(random.randint(1, 4))
                ],
                "conditions": random.sample(conditions, random.randint(1, 3)),
                "allergies": random.sample(allergies, random.randint(0, 2))
            }
            records.append(record)
        
        return records
    
    @staticmethod
    def generate_contracts(num_contracts=50):
        """Generate realistic legal contracts."""
        contract_types = [
            "Service Agreement", "NDA", "Employment Agreement",
            "Software License", "Vendor Agreement"
        ]
        
        contracts = []
        for i in range(num_contracts):
            contract = {
                "contract_id": f"CTR{1000+i}",
                "type": contract_types[i % len(contract_types)],
                "parties": [f"Company {i}", f"Partner {i}"],
                "created_date": (datetime.now() - timedelta(days=i*10)).isoformat(),
                "value": f"${(i+1)*10000}",
                "status": "active" if i < num_contracts - 5 else "expired",
                "review_date": (datetime.now() + timedelta(days=30)).isoformat()
            }
            contracts.append(contract)
        
        return contracts
    
    @staticmethod
    def generate_hotel_reservations(num_reservations=500):
        """Generate realistic hotel reservations."""
        room_types = ["Standard", "Deluxe", "Suite", "Presidential"]
        
        reservations = []
        for i in range(num_reservations):
            check_in = datetime.now() + timedelta(days=i)
            check_out = check_in + timedelta(days=random.randint(1, 7))
            
            reservation = {
                "reservation_id": f"RES{100000+i}",
                "guest_name": f"Guest {i}",
                "check_in": check_in.date().isoformat(),
                "check_out": check_out.date().isoformat(),
                "room_type": room_types[i % len(room_types)],
                "room_number": f"{(i%30)+1:02d}{(i%20)+1:02d}",
                "guests": random.randint(1, 4),
                "rate_per_night": round(100 + i * 0.5, 2),
                "status": "confirmed"
            }
            reservations.append(reservation)
        
        return reservations
    
    @staticmethod
    def generate_restaurant_orders(num_orders=1000):
        """Generate realistic restaurant orders."""
        menu_items = [
            {"name": "Caesar Salad", "price": 12.99},
            {"name": "Grilled Salmon", "price": 28.99},
            {"name": "Steak Ribeye", "price": 42.99},
            {"name": "Pasta Carbonara", "price": 18.99},
            {"name": "House Wine", "price": 35.00}
        ]
        
        orders = []
        for i in range(num_orders):
            order = {
                "order_id": f"ORD{100000+i}",
                "table_number": random.randint(1, 20),
                "timestamp": (datetime.now() - timedelta(minutes=random.randint(0, 1440))).isoformat(),
                "items": [
                    {
                        "name": item["name"],
                        "quantity": random.randint(1, 3),
                        "price": item["price"]
                    }
                    for item in random.sample(menu_items, random.randint(2, 4))
                ],
                "status": random.choice(["completed", "in_progress"])
            }
            orders.append(order)
        
        return orders


def save_fixture_files(output_dir: Path):
    """Save generated fixtures to files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    generator = TestDataGenerator()
    
    # Generate and save various fixtures
    financial_data = generator.generate_financial_data()
    with open(output_dir / "financial_data.json", "w") as f:
        json.dump(financial_data, f, indent=2)
    
    patient_records = generator.generate_patient_records(50)
    with open(output_dir / "patient_records.json", "w") as f:
        json.dump(patient_records, f, indent=2)
    
    contracts = generator.generate_contracts(30)
    with open(output_dir / "contracts.json", "w") as f:
        json.dump(contracts, f, indent=2)
    
    reservations = generator.generate_hotel_reservations(100)
    with open(output_dir / "hotel_reservations.json", "w") as f:
        json.dump(reservations, f, indent=2)
    
    orders = generator.generate_restaurant_orders(200)
    with open(output_dir / "restaurant_orders.json", "w") as f:
        json.dump(orders, f, indent=2)


if __name__ == "__main__":
    fixture_dir = Path(__file__).parent / "fixtures"
    save_fixture_files(fixture_dir)
    print(f"Test fixtures saved to {fixture_dir}")
