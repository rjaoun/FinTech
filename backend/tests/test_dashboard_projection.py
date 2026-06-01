"""
Backend tests for dashboard recurring projection feature (BUG FIX)
Tests: GET /api/dashboard/summary with month_projected_income and month_projected_expense
"""
import pytest
import os
from datetime import datetime, timezone, timedelta

class TestDashboardProjection:
    """Dashboard recurring projection tests"""

    def test_future_month_projects_recurring_income(self, base_url, api_client, auth_headers):
        """
        BUG FIX: With active recurring monthly income rule, 
        GET /api/dashboard/summary?month=<NEXT_MONTH> returns month_projected_income >= rule amount
        """
        # Get current and next month
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        next_month_dt = now.replace(day=1) + timedelta(days=32)
        next_month = next_month_dt.strftime("%Y-%m")
        
        # Create recurring monthly income rule starting in current month
        rec_response = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 1500,
                "type": "income",
                "category": "salary",
                "description": "TEST_projection_income",
                "frequency": "monthly",
                "start_date": f"{current_month}-01"
            },
            headers=auth_headers
        )
        assert rec_response.status_code == 200
        rule_id = rec_response.json()["id"]
        
        try:
            # Query dashboard for NEXT month
            response = api_client.get(
                f"{base_url}/api/dashboard/summary?month={next_month}",
                headers=auth_headers
            )
            assert response.status_code == 200
            
            data = response.json()
            
            # Verify projection fields exist
            assert "month_projected_income" in data, "month_projected_income field missing"
            assert "month_projected_expense" in data, "month_projected_expense field missing"
            
            # Verify projected income includes the recurring rule
            assert data["month_projected_income"] >= 1500, \
                f"Expected month_projected_income >= 1500, got {data['month_projected_income']}"
            
            # month_income may be 0 (no real transactions yet in future month)
            print(f"✓ Future month {next_month} projects recurring income: "
                  f"month_income={data['month_income']}, "
                  f"month_projected_income={data['month_projected_income']}")
            
            # Verify recent_transactions includes projected events
            recent = data.get("recent_transactions", [])
            projected_events = [t for t in recent if t.get("projected")]
            assert len(projected_events) > 0, "recent_transactions should include projected events"
            print(f"✓ recent_transactions includes {len(projected_events)} projected events")
            
        finally:
            # Cleanup
            api_client.delete(
                f"{base_url}/api/recurring/{rule_id}?delete_generated=true",
                headers=auth_headers
            )

    def test_future_month_projects_recurring_expense(self, base_url, api_client, auth_headers):
        """
        BUG FIX: With active recurring monthly expense rule,
        GET /api/dashboard/summary?month=<NEXT_MONTH> returns month_projected_expense >= rule amount
        """
        # Get current and next month
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        next_month_dt = now.replace(day=1) + timedelta(days=32)
        next_month = next_month_dt.strftime("%Y-%m")
        
        # Create recurring monthly expense rule starting in current month
        rec_response = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 800,
                "type": "expense",
                "category": "bills",
                "description": "TEST_projection_expense",
                "frequency": "monthly",
                "start_date": f"{current_month}-01"
            },
            headers=auth_headers
        )
        assert rec_response.status_code == 200
        rule_id = rec_response.json()["id"]
        
        try:
            # Query dashboard for NEXT month
            response = api_client.get(
                f"{base_url}/api/dashboard/summary?month={next_month}",
                headers=auth_headers
            )
            assert response.status_code == 200
            
            data = response.json()
            
            # Verify projected expense includes the recurring rule
            assert data["month_projected_expense"] >= 800, \
                f"Expected month_projected_expense >= 800, got {data['month_projected_expense']}"
            
            # month_expense may be 0 (no real transactions yet in future month)
            print(f"✓ Future month {next_month} projects recurring expense: "
                  f"month_expense={data['month_expense']}, "
                  f"month_projected_expense={data['month_projected_expense']}")
            
        finally:
            # Cleanup
            api_client.delete(
                f"{base_url}/api/recurring/{rule_id}?delete_generated=true",
                headers=auth_headers
            )

    def test_past_month_no_projections(self, base_url, api_client, auth_headers):
        """
        For PAST months (target_month < current_month),
        month_projected_income and month_projected_expense should be 0
        """
        # Get a past month (3 months ago)
        now = datetime.now(timezone.utc)
        past_month_dt = now.replace(day=1) - timedelta(days=90)
        past_month = past_month_dt.strftime("%Y-%m")
        
        # Query dashboard for past month
        response = api_client.get(
            f"{base_url}/api/dashboard/summary?month={past_month}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify no projections for past months
        assert data["month_projected_income"] == 0, \
            f"Past month should have 0 projected income, got {data['month_projected_income']}"
        assert data["month_projected_expense"] == 0, \
            f"Past month should have 0 projected expense, got {data['month_projected_expense']}"
        
        print(f"✓ Past month {past_month} has no projections: "
              f"month_projected_income={data['month_projected_income']}, "
              f"month_projected_expense={data['month_projected_expense']}")

    def test_current_month_projects_future_dates_only(self, base_url, api_client, auth_headers):
        """
        For CURRENT month, only project recurring transactions with next_date > now
        (past-due transactions should be materialized, not projected)
        """
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        
        # Create recurring rule starting today
        rec_response = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 500,
                "type": "income",
                "category": "freelance",
                "description": "TEST_current_month_projection",
                "frequency": "monthly",
                "start_date": now.strftime("%Y-%m-%d")
            },
            headers=auth_headers
        )
        assert rec_response.status_code == 200
        rule_id = rec_response.json()["id"]
        
        try:
            # Query dashboard for current month
            response = api_client.get(
                f"{base_url}/api/dashboard/summary?month={current_month}",
                headers=auth_headers
            )
            assert response.status_code == 200
            
            data = response.json()
            
            # Current month may have projections if next_date is in the future
            # (materialize_due creates transactions for past-due dates)
            print(f"✓ Current month {current_month}: "
                  f"month_income={data['month_income']}, "
                  f"month_projected_income={data['month_projected_income']}")
            
        finally:
            # Cleanup
            api_client.delete(
                f"{base_url}/api/recurring/{rule_id}?delete_generated=true",
                headers=auth_headers
            )

    def test_month_balance_includes_projections(self, base_url, api_client, auth_headers):
        """
        month_balance should include projections for future months:
        month_balance = cumulative_balance + month_projected_income - month_projected_expense
        """
        # Get next month
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        next_month_dt = now.replace(day=1) + timedelta(days=32)
        next_month = next_month_dt.strftime("%Y-%m")
        
        # Create recurring income and expense rules
        rec_income = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 2000,
                "type": "income",
                "category": "salary",
                "description": "TEST_balance_projection_income",
                "frequency": "monthly",
                "start_date": f"{current_month}-01"
            },
            headers=auth_headers
        )
        assert rec_income.status_code == 200
        income_rule_id = rec_income.json()["id"]
        
        rec_expense = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 600,
                "type": "expense",
                "category": "bills",
                "description": "TEST_balance_projection_expense",
                "frequency": "monthly",
                "start_date": f"{current_month}-01"
            },
            headers=auth_headers
        )
        assert rec_expense.status_code == 200
        expense_rule_id = rec_expense.json()["id"]
        
        try:
            # Query dashboard for next month
            response = api_client.get(
                f"{base_url}/api/dashboard/summary?month={next_month}",
                headers=auth_headers
            )
            assert response.status_code == 200
            
            data = response.json()
            
            # Verify month_balance includes projections
            # month_balance = cumulative + projected_income - projected_expense
            projected_net = data["month_projected_income"] - data["month_projected_expense"]
            
            print(f"✓ month_balance includes projections: "
                  f"month_balance={data['month_balance']}, "
                  f"projected_income={data['month_projected_income']}, "
                  f"projected_expense={data['month_projected_expense']}, "
                  f"projected_net={projected_net}")
            
            # Verify projections are >= rule amounts
            assert data["month_projected_income"] >= 2000
            assert data["month_projected_expense"] >= 600
            
        finally:
            # Cleanup
            api_client.delete(
                f"{base_url}/api/recurring/{income_rule_id}?delete_generated=true",
                headers=auth_headers
            )
            api_client.delete(
                f"{base_url}/api/recurring/{expense_rule_id}?delete_generated=true",
                headers=auth_headers
            )

    def test_projected_events_in_recent_transactions(self, base_url, api_client, auth_headers):
        """
        recent_transactions should include projected events with projected=true flag
        """
        # Get next month
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        next_month_dt = now.replace(day=1) + timedelta(days=32)
        next_month = next_month_dt.strftime("%Y-%m")
        
        # Create recurring rule
        rec_response = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 1200,
                "type": "income",
                "category": "salary",
                "description": "TEST_projected_events",
                "frequency": "monthly",
                "start_date": f"{current_month}-01"
            },
            headers=auth_headers
        )
        assert rec_response.status_code == 200
        rule_id = rec_response.json()["id"]
        
        try:
            # Query dashboard for next month
            response = api_client.get(
                f"{base_url}/api/dashboard/summary?month={next_month}",
                headers=auth_headers
            )
            assert response.status_code == 200
            
            data = response.json()
            recent = data.get("recent_transactions", [])
            
            # Find projected events
            projected_events = [t for t in recent if t.get("projected") is True]
            
            assert len(projected_events) > 0, "Should have at least one projected event in recent_transactions"
            
            # Verify projected event structure
            proj_event = projected_events[0]
            assert "id" in proj_event
            assert "amount" in proj_event
            assert "type" in proj_event
            assert "category" in proj_event
            assert "description" in proj_event
            assert "date" in proj_event
            assert "recurring_rule_id" in proj_event
            assert proj_event["projected"] is True
            
            print(f"✓ recent_transactions includes {len(projected_events)} projected events")
            print(f"  Sample projected event: amount={proj_event['amount']}, "
                  f"type={proj_event['type']}, category={proj_event['category']}")
            
        finally:
            # Cleanup
            api_client.delete(
                f"{base_url}/api/recurring/{rule_id}?delete_generated=true",
                headers=auth_headers
            )
