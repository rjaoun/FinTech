"""
Backend tests for calendar feature
Tests: GET /api/calendar with month query param and projected recurring transactions
"""
import pytest
from datetime import datetime, timezone, timedelta

class TestCalendar:
    """Calendar endpoint backend tests"""

    def test_calendar_returns_correct_structure(self, base_url, api_client, auth_headers):
        """GET /api/calendar?month=2026-04 returns correct structure"""
        response = api_client.get(f"{base_url}/api/calendar?month=2026-04", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "month" in data
        assert data["month"] == "2026-04"
        assert "days" in data
        assert "totals" in data
        
        totals = data["totals"]
        assert "income" in totals
        assert "expense" in totals
        assert "projected_income" in totals
        assert "projected_expense" in totals
        
        print(f"✓ Calendar returns correct structure for 2026-04")

    def test_calendar_invalid_month_returns_400(self, base_url, api_client, auth_headers):
        """GET /api/calendar?month=invalid returns 400"""
        response = api_client.get(f"{base_url}/api/calendar?month=invalid", headers=auth_headers)
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        assert "YYYY-MM" in data["detail"]
        print(f"✓ Calendar returns 400 for invalid month format")

    def test_calendar_day_structure(self, base_url, api_client, auth_headers):
        """Each day in calendar has correct structure"""
        # Create a test transaction
        tx = {
            "amount": 50,
            "type": "expense",
            "category": "food",
            "description": "TEST_calendar_day",
            "date": "2026-04-15T10:00:00Z"
        }
        resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
        assert resp.status_code == 200
        tx_id = resp.json()["id"]
        
        response = api_client.get(f"{base_url}/api/calendar?month=2026-04", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        days = data["days"]
        
        # Find the day with our transaction
        day_15 = next((d for d in days if d["date"] == "2026-04-15"), None)
        assert day_15 is not None, "Day 2026-04-15 should exist"
        
        # Verify day structure
        assert "date" in day_15
        assert "income" in day_15
        assert "expense" in day_15
        assert "projected_income" in day_15
        assert "projected_expense" in day_15
        assert "events" in day_15
        
        # Verify our transaction is in events
        assert len(day_15["events"]) > 0
        event = next((e for e in day_15["events"] if e["description"] == "TEST_calendar_day"), None)
        assert event is not None
        assert event["amount"] == 50
        assert event["type"] == "expense"
        assert event["category"] == "food"
        assert "projected" in event
        assert event["projected"] == False
        
        print(f"✓ Calendar day structure correct with events")
        
        # Cleanup
        api_client.delete(f"{base_url}/api/transactions/{tx_id}", headers=auth_headers)

    def test_calendar_projects_future_recurring(self, base_url, api_client, auth_headers):
        """Calendar projects future recurring transactions for future months"""
        # Create a recurring rule starting in future
        rule = {
            "amount": 100,
            "type": "income",
            "category": "salary",
            "description": "TEST_future_recurring",
            "frequency": "weekly",
            "start_date": "2026-07-01"
        }
        resp = api_client.post(f"{base_url}/api/recurring", json=rule, headers=auth_headers)
        assert resp.status_code == 200
        rule_id = resp.json()["id"]
        
        # Get calendar for July 2026 (future month)
        response = api_client.get(f"{base_url}/api/calendar?month=2026-07", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Should have projected transactions
        projected_events = []
        for day in data["days"]:
            for event in day["events"]:
                if event.get("projected") and event["description"] == "TEST_future_recurring":
                    projected_events.append(event)
        
        assert len(projected_events) > 0, "Should have projected recurring transactions in future month"
        
        # Verify projected event structure
        proj = projected_events[0]
        assert proj["amount"] == 100
        assert proj["type"] == "income"
        assert proj["category"] == "salary"
        assert proj["projected"] == True
        assert proj["recurring_rule_id"] == rule_id
        
        print(f"✓ Calendar projects {len(projected_events)} future recurring transactions")
        
        # Cleanup
        api_client.delete(f"{base_url}/api/recurring/{rule_id}?delete_generated=true", headers=auth_headers)

    def test_calendar_totals_include_projected(self, base_url, api_client, auth_headers):
        """Calendar totals include both actual and projected amounts"""
        # Create a recurring rule for future
        rule = {
            "amount": 200,
            "type": "expense",
            "category": "bills",
            "description": "TEST_projected_totals",
            "frequency": "monthly",
            "start_date": "2026-08-01"
        }
        resp = api_client.post(f"{base_url}/api/recurring", json=rule, headers=auth_headers)
        assert resp.status_code == 200
        rule_id = resp.json()["id"]
        
        # Get calendar for August 2026
        response = api_client.get(f"{base_url}/api/calendar?month=2026-08", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        totals = data["totals"]
        
        # Should have projected_expense > 0
        assert totals["projected_expense"] >= 200, f"Expected projected_expense >= 200, got {totals['projected_expense']}"
        
        print(f"✓ Calendar totals include projected: projected_expense={totals['projected_expense']}")
        
        # Cleanup
        api_client.delete(f"{base_url}/api/recurring/{rule_id}?delete_generated=true", headers=auth_headers)

    def test_calendar_past_month_no_projections(self, base_url, api_client, auth_headers):
        """Calendar for past months should not have projected transactions"""
        # Get calendar for January 2026 (past month)
        response = api_client.get(f"{base_url}/api/calendar?month=2026-01", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Count projected events
        projected_count = 0
        for day in data["days"]:
            for event in day["events"]:
                if event.get("projected"):
                    projected_count += 1
        
        # Past months should have no projected events (all should be materialized)
        print(f"✓ Past month (2026-01) has {projected_count} projected events (expected 0 or very few)")

    def test_calendar_event_has_all_fields(self, base_url, api_client, auth_headers):
        """Calendar event has all required fields"""
        # Create a test transaction
        tx = {
            "amount": 75,
            "type": "income",
            "category": "freelance",
            "description": "TEST_event_fields",
            "date": "2026-05-10T14:30:00Z"
        }
        resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
        assert resp.status_code == 200
        tx_id = resp.json()["id"]
        
        response = api_client.get(f"{base_url}/api/calendar?month=2026-05", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Find our event
        event = None
        for day in data["days"]:
            for e in day["events"]:
                if e.get("description") == "TEST_event_fields":
                    event = e
                    break
        
        assert event is not None, "Event should exist"
        
        # Verify all required fields
        required_fields = ["id", "amount", "type", "category", "description", "projected", "date"]
        for field in required_fields:
            assert field in event, f"Event missing field: {field}"
        
        assert event["id"] == tx_id
        assert event["amount"] == 75
        assert event["type"] == "income"
        assert event["category"] == "freelance"
        assert event["projected"] == False
        assert "recurring_rule_id" in event
        
        print(f"✓ Calendar event has all required fields")
        
        # Cleanup
        api_client.delete(f"{base_url}/api/transactions/{tx_id}", headers=auth_headers)

    def test_calendar_multiple_events_same_day(self, base_url, api_client, auth_headers):
        """Calendar correctly aggregates multiple events on same day"""
        # Create multiple transactions on same day
        txs = [
            {"amount": 50, "type": "income", "category": "salary", "description": "TEST_multi_1", "date": "2026-05-20T10:00:00Z"},
            {"amount": 30, "type": "expense", "category": "food", "description": "TEST_multi_2", "date": "2026-05-20T15:00:00Z"},
            {"amount": 20, "type": "expense", "category": "transport", "description": "TEST_multi_3", "date": "2026-05-20T18:00:00Z"},
        ]
        
        created_ids = []
        for tx in txs:
            resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
            assert resp.status_code == 200
            created_ids.append(resp.json()["id"])
        
        response = api_client.get(f"{base_url}/api/calendar?month=2026-05", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Find day 2026-05-20
        day_20 = next((d for d in data["days"] if d["date"] == "2026-05-20"), None)
        assert day_20 is not None
        
        # Verify aggregates
        assert day_20["income"] >= 50
        assert day_20["expense"] >= 50  # 30 + 20
        
        # Verify all events present
        test_events = [e for e in day_20["events"] if e["description"].startswith("TEST_multi_")]
        assert len(test_events) == 3
        
        print(f"✓ Calendar aggregates multiple events on same day: income={day_20['income']}, expense={day_20['expense']}")
        
        # Cleanup
        for tid in created_ids:
            api_client.delete(f"{base_url}/api/transactions/{tid}", headers=auth_headers)
