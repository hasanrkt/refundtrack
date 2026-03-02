export type Platform = "Amazon" | "Flipkart" | "Myntra" | "Meesho" | "Other";
export type RefundFormStatus = "Pending" | "Submitted";
export type RefundStatus = "Not Started" | "Processing" | "Refunded";

export interface Order {
  id: string;
  platform: Platform;
  deal_source: string;
  order_date: string;
  account_name: string;
  order_amount: number;
  less_amount: number;
  refund_amount: number;
  mediator_name?: string;
  refund_form_status: RefundFormStatus;
  refund_form_date?: string;
  refund_status: RefundStatus;
  refund_date?: string;
  notes?: string;
  created_at?: string;
}

export interface DashboardMetrics {
  totalOrders: number;
  totalInvested: number;
  totalRefundReceived: number;
  netProfitLoss: number;
  pendingRefundAmount: number;
}
