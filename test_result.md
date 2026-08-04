#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Rebuild the GitHub FinanceFocus app as a mobile application. Must include authentication that works in a mobile app, and AI-powered spending insights/category suggestions. Design agent decides the UI/UX."

backend:
  - task: "Transaction paid field & PATCH /transactions/{id}/paid endpoint"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added `paid: bool = True` on TransactionIn/Out; PATCH /transactions/{id}/paid endpoint sets paid; PUT /transactions/{id} now also persists paid. Startup backfill sets paid=true on legacy docs. Needs backend test for create/read/update/patch/delete round-trip of `paid` field."

  - task: "Existing endpoints regression (auth, transactions CRUD, dashboard summary, recurring)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "No functional changes to auth/recurring/dashboard in this iteration; verify no regression from paid schema additions."

frontend:
  - task: "Dashboard + Activity merge with Paid/Unpaid sections & inline edit"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Removed obsolete (tabs)/transactions.tsx. Homepage now shows month carousel + balance + inline Activity list. Paid/Unpaid filter chips, checkbox toggles calling PATCH /transactions/{id}/paid, inline pencil/trash icons routing to /add-transaction?id=... with paid param. Search bar retained."

  - task: "add-transaction preserves paid status on edit"
    implemented: true
    working: "NA"
    file: "frontend/app/add-transaction.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added paid param handling: reads params.paid ('0'|'1') and includes paid in PUT/POST payload. Fixed fallback route from removed /(tabs)/transactions to /(tabs)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 7
  run_ui: true

test_plan:
  current_focus:
    - "Transaction paid field & PATCH /transactions/{id}/paid endpoint"
    - "Dashboard + Activity merge with Paid/Unpaid sections & inline edit"
    - "add-transaction preserves paid status on edit"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Verified merged Dashboard renders correctly (screenshot captured; activity list, paid checkboxes and Paid/Unpaid filter visible). Deleted obsolete /(tabs)/transactions.tsx and its tab entry. Added `paid` param handling in add-transaction so editing an unpaid transaction no longer flips it to paid. Backend PATCH /transactions/{id}/paid was added by previous agent — needs first-time testing. Please test both backend (paid CRUD roundtrip via PATCH endpoint + PUT with paid=false persistence) and frontend (login as admin@financefocus.app/admin123, toggle paid checkbox, filter Paid/Unpaid, tap pencil to edit an unpaid tx and confirm it stays unpaid after save)."
  - agent: "user"
    message: "I added a transaction but I don't see it."
  - agent: "main"
    message: "BUG FIX iteration 8: user added a recurring transaction (POST /api/recurring in logs) but did not see it in the Dashboard Activity list. Root cause: Activity list only rendered `allTx` (real materialized transactions from GET /transactions) and completely ignored projected/upcoming recurring events. If a user adds a recurring rule with a future start date within the current month, or views a future month, no rows show even though the balance card includes the projection. FIX: Dashboard now also fetches GET /api/calendar?month=X and merges `projected` events into the Activity list with an 'Upcoming' pill, dashed border style, disabled paid checkbox (shows clock icon), and no edit/delete buttons — only informational 'auto on MM-DD' hint. Updated unpaid count pill label to 'upcoming' and includes projected events. Please retest: (1) login admin@financefocus.app/admin123, (2) add a NEW RECURRING transaction (any frequency, start date today or future within current month) and verify it appears in Activity list — either as a real row (materialized) if start<=today OR as an 'Upcoming' row (projected) otherwise. (3) Navigate to next month via arrow, verify projected recurring appears as Upcoming rows. (4) Confirm previously-tested paid toggle and inline edit still work on real (non-projected) rows. (5) Confirm delete on real row still works. Files changed: /app/frontend/app/(tabs)/index.tsx only."
