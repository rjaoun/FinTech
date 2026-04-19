export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
};

export type Transaction = {
  id: string;
  user_id: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  description: string;
  date: string;
  created_at: string;
};

export type DashboardSummary = {
  balance: number;
  total_income: number;
  total_expense: number;
  month_income: number;
  month_expense: number;
  month_savings: number;
  monthly_series: { month: string; income: number; expense: number }[];
  category_breakdown: { category: string; amount: number }[];
  recent_transactions: Transaction[];
  transaction_count: number;
};

export type Budget = {
  id: string;
  user_id: string;
  category: string;
  amount: number;
  month: string;
  spent: number;
  created_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
  created_at: string;
};

export type AIInsight = {
  summary: string;
  top_categories: { category: string; amount: number; insight: string }[];
  anomalies: { description: string; severity: "low" | "medium" | "high" }[];
  tips: string[];
  forecast_next_month: { expected_expense: number; confidence: "low" | "medium" | "high" } | null;
  generated_at: string;
  fallback?: boolean;
};
