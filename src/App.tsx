import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  LayoutDashboard, 
  ListOrdered, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Search,
  Filter,
  ArrowUpDown,
  Trash2,
  Edit2,
  X,
  ChevronRight,
  ChevronDown,
  Download,
  Upload,
  Database
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, AnimatePresence } from "motion/react";
import { Order, DashboardMetrics, Platform, RefundFormStatus, RefundStatus } from "./types";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PLATFORMS: Platform[] = ["Amazon", "Flipkart", "Myntra", "Meesho", "Other"];
const DEAL_SOURCES = ["Direct", "Telegram", "WhatsApp"];
const MEDIATORS = ["NJ", "KAKA", "Other"];
const REFUND_FORM_STATUSES: RefundFormStatus[] = ["Pending", "Submitted"];
const REFUND_STATUSES: RefundStatus[] = ["Not Started", "Processing", "Refunded"];

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function App() {
  const [activeTab, setActiveTab] = useState<"orders" | "dashboard">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("All");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMediator, setSelectedMediator] = useState<string>("NJ");
  const [customMediator, setCustomMediator] = useState<string>("");
  const [formValues, setFormValues] = useState({
    order_amount: 0,
    less_amount: 0,
    refund_amount: 0
  });
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
  const [localBackupData, setLocalBackupData] = useState<Order[] | null>(null);

  // Fetch orders
  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/orders");
      const data = await response.json();
      setOrders(data);
      
      // Check for recovery if server is empty but local storage has data
      if (data.length === 0) {
        const saved = localStorage.getItem("refund_tracker_local_sync");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) {
            setLocalBackupData(parsed);
            setShowRecoveryPrompt(true);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Sync to local storage for recovery
  useEffect(() => {
    if (orders.length > 0) {
      localStorage.setItem("refund_tracker_local_sync", JSON.stringify(orders));
    }
  }, [orders]);

  const handleRecoverData = async () => {
    if (!localBackupData) return;
    
    setIsRestoring(true);
    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localBackupData),
      });

      if (response.ok) {
        setShowRecoveryPrompt(false);
        fetchOrders();
      }
    } catch (error) {
      console.error("Recovery error:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleBackup = () => {
    window.location.href = "/api/backup";
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (!confirm("This will replace all current data with the backup. Are you sure?")) {
          return;
        }

        setIsRestoring(true);
        const response = await fetch("/api/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          alert("Data restored successfully!");
          fetchOrders();
        } else {
          const err = await response.json();
          alert(err.error || "Failed to restore data.");
        }
      } catch (error) {
        console.error("Restore error:", error);
        alert("Invalid backup file format.");
      } finally {
        setIsRestoring(false);
        // Reset input
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.mediator_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
      const matchesPlatform = platformFilter === "All" || order.platform === platformFilter;
      
      let matchesDate = true;
      if (dateRange.start && dateRange.end) {
        const orderDate = parseISO(order.order_date);
        matchesDate = isWithinInterval(orderDate, {
          start: startOfDay(parseISO(dateRange.start)),
          end: endOfDay(parseISO(dateRange.end))
        });
      }

      return matchesSearch && matchesPlatform && matchesDate;
    });
  }, [orders, searchQuery, platformFilter, dateRange]);

  // Dashboard Metrics
  const metrics = useMemo<DashboardMetrics>(() => {
    return {
      totalOrders: orders.length,
      totalInvested: orders.reduce((sum, o) => sum + o.order_amount, 0),
      totalRefundReceived: orders.reduce((sum, o) => sum + o.refund_amount, 0),
      netProfitLoss: orders.reduce((sum, o) => sum + (o.refund_amount - o.order_amount), 0),
      pendingRefundAmount: orders.reduce((sum, o) => o.refund_status === "Processing" ? sum + o.order_amount : sum, 0),
    };
  }, [orders]);

  // Chart Data
  const platformData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      counts[o.platform] = (counts[o.platform] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { name: string; invested: number; refunded: number }> = {};
    orders.forEach(o => {
      const month = format(parseISO(o.order_date), "MMM yyyy");
      if (!months[month]) {
        months[month] = { name: month, invested: 0, refunded: 0 };
      }
      months[month].invested += o.order_amount;
      months[month].refunded += o.refund_amount;
    });
    return Object.values(months).sort((a, b) => {
      const dateA = new Date(a.name).getTime();
      const dateB = new Date(b.name).getTime();
      return dateA - dateB;
    });
  }, [orders]);

  useEffect(() => {
    if (isModalOpen && editingOrder) {
      setFormValues({
        order_amount: editingOrder.order_amount,
        less_amount: editingOrder.less_amount || 0,
        refund_amount: editingOrder.refund_amount
      });
      
      if (editingOrder.mediator_name === "NJ" || editingOrder.mediator_name === "KAKA") {
        setSelectedMediator(editingOrder.mediator_name);
        setCustomMediator("");
      } else if (editingOrder.mediator_name) {
        setSelectedMediator("Other");
        setCustomMediator(editingOrder.mediator_name);
      } else {
        setSelectedMediator("NJ");
        setCustomMediator("");
      }
    } else if (isModalOpen) {
      setFormValues({
        order_amount: 0,
        less_amount: 0,
        refund_amount: 0
      });
      setSelectedMediator("NJ");
      setCustomMediator("");
    }
  }, [isModalOpen, editingOrder]);

  const handleAmountChange = (field: 'order_amount' | 'less_amount', value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormValues(prev => {
      const next = { ...prev, [field]: numValue };
      next.refund_amount = Math.max(0, next.order_amount - next.less_amount);
      return next;
    });
  };

  const handleSaveOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const orderData = {
      id: formData.get("id") as string,
      platform: formData.get("platform") as Platform,
      deal_source: formData.get("deal_source") as string,
      order_date: formData.get("order_date") as string,
      account_name: formData.get("account_name") as string,
      order_amount: formValues.order_amount,
      less_amount: formValues.less_amount,
      refund_amount: formValues.refund_amount,
      mediator_name: selectedMediator === "Other" ? customMediator : selectedMediator,
      refund_form_status: editingOrder?.refund_form_status ?? "Pending",
      refund_form_date: editingOrder?.refund_form_date,
      refund_status: editingOrder?.refund_status ?? "Not Started",
      notes: formData.get("notes") as string,
    };

    if (isNaN(orderData.order_amount)) {
      setFormError("Please enter a valid order amount.");
      setIsSubmitting(false);
      return;
    }

    try {
      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (response.ok) {
        fetchOrders();
        setIsModalOpen(false);
        setEditingOrder(null);
      } else {
        setFormError(result.error || "Failed to save order. Please try again.");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      setFormError("A network error occurred. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleFormStatus = async (order: Order) => {
    const newStatus = order.refund_form_status === "Pending" ? "Submitted" : "Pending";
    const newDate = newStatus === "Submitted" ? format(new Date(), "yyyy-MM-dd HH:mm") : null;
    
    try {
      const response = await fetch(`/api/orders/${order.id}/toggle-form`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, date: newDate }),
      });
      if (response.ok) fetchOrders();
    } catch (error) {
      console.error("Error toggling form status:", error);
    }
  };

  const handleToggleRefundStatus = async (order: Order) => {
    let nextStatus: RefundStatus;
    if (order.refund_status === "Not Started") nextStatus = "Processing";
    else if (order.refund_status === "Processing") nextStatus = "Refunded";
    else nextStatus = "Not Started";

    const nextDate = nextStatus === "Refunded" ? format(new Date(), "yyyy-MM-dd HH:mm") : null;

    try {
      const response = await fetch(`/api/orders/${order.id}/toggle-refund`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, date: nextDate }),
      });
      if (response.ok) fetchOrders();
    } catch (error) {
      console.error("Error toggling refund status:", error);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    setDeleteError(null);
    try {
      const response = await fetch(`/api/orders/${orderToDelete}`, { method: "DELETE" });
      const result = await response.json();
      
      if (response.ok) {
        fetchOrders();
        setIsDeleteModalOpen(false);
        setOrderToDelete(null);
      } else {
        setDeleteError(result.error || "Failed to delete order.");
      }
    } catch (error) {
      console.error("Error deleting order:", error);
      setDeleteError("A network error occurred.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white border-b border-black/5 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-xl tracking-tight">RefundTracker</span>
            </div>
            
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("orders")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === "orders" ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <ListOrdered className="w-4 h-4" />
                Orders
              </button>
              <button
                onClick={() => setActiveTab("dashboard")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === "dashboard" ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
            </div>

            <button
              onClick={() => {
                setEditingOrder(null);
                setIsModalOpen(true);
              }}
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Order
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {showRecoveryPrompt && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-indigo-600 rounded-3xl text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Found Local Backup!</h3>
                <p className="text-indigo-100 text-sm">Your server data seems to have reset, but we found {localBackupData?.length} records in your browser.</p>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setShowRecoveryPrompt(false)}
                className="flex-1 sm:flex-none px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-semibold transition-colors text-sm"
              >
                Ignore
              </button>
              <button 
                onClick={handleRecoverData}
                disabled={isRestoring}
                className="flex-1 sm:flex-none px-6 py-3 bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold transition-colors shadow-lg text-sm flex items-center justify-center gap-2"
              >
                {isRestoring ? "Restoring..." : "Restore Now"}
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "dashboard" ? (
          <div className="space-y-6 sm:space-y-8">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <MetricCard 
                label="Total Orders" 
                value={metrics.totalOrders} 
                icon={<ListOrdered className="w-5 h-5" />}
              />
              <MetricCard 
                label="Total Invested" 
                value={`₹${metrics.totalInvested.toFixed(0)}`} 
                icon={<TrendingDown className="w-5 h-5 text-red-500" />}
              />
              <MetricCard 
                label="Refund Received" 
                value={`₹${metrics.totalRefundReceived.toFixed(0)}`} 
                icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
              />
              <MetricCard 
                label="Net P/L" 
                value={`₹${metrics.netProfitLoss.toFixed(0)}`} 
                icon={metrics.netProfitLoss >= 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                trend={metrics.netProfitLoss >= 0 ? "positive" : "negative"}
              />
              <MetricCard 
                label="Pending" 
                value={`₹${metrics.pendingRefundAmount.toFixed(0)}`} 
                icon={<Clock className="w-5 h-5 text-amber-500" />}
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                <h3 className="text-lg font-semibold mb-6">Monthly Performance</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="invested" fill="#ef4444" radius={[4, 4, 0, 0]} name="Invested" />
                      <Bar dataKey="refunded" fill="#10b981" radius={[4, 4, 0, 0]} name="Refunded" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                <h3 className="text-lg font-semibold mb-6">Platform Distribution</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={platformData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {platformData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Search by ID, Account, or Mediator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-black/5 transition-all"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select 
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="bg-gray-50 border-none rounded-xl text-sm py-2 px-4 focus:ring-2 focus:ring-black/5"
                >
                  <option value="All">All Platforms</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-gray-50 border-none rounded-xl text-sm py-2 px-4 focus:ring-2 focus:ring-black/5"
                />
                <span className="text-gray-400">to</span>
                <input 
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-gray-50 border-none rounded-xl text-sm py-2 px-4 focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>

            {/* Orders Table - Desktop */}
            <div className="hidden sm:block bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 border-bottom border-black/5">
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mediator</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Less</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Refund Amount</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Refund</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Refund Form</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs font-medium">{order.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{order.platform}</span>
                            {order.deal_source && order.deal_source !== 'Direct' && (
                              <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-tighter">{order.deal_source}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500">{format(parseISO(order.order_date), "MMM dd, yyyy")}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium">{order.account_name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500">{order.mediator_name || "-"}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium">₹{order.order_amount.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-400">₹{(order.less_amount || 0).toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-sm font-medium",
                            order.refund_amount > 0 ? "text-emerald-600" : "text-gray-400"
                          )}>
                            ₹{order.refund_amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <button 
                              onClick={() => handleToggleRefundStatus(order)}
                              className="hover:opacity-80 transition-opacity"
                            >
                              <StatusBadge status={order.refund_status} />
                            </button>
                            {order.refund_date && (
                              <span className="text-[9px] text-gray-400 text-center font-medium">
                                {order.refund_date}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleToggleFormStatus(order)}
                              className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5",
                                order.refund_form_status === "Submitted" 
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                                  : "bg-red-50 text-red-600 border-red-200"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                order.refund_form_status === "Submitted" ? "bg-emerald-500" : "bg-red-500"
                              )} />
                              {order.refund_form_status}
                            </button>
                            {order.refund_form_date && (
                              <span className="text-[9px] text-gray-400 text-center font-medium">
                                {order.refund_form_date}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingOrder(order);
                                setIsModalOpen(true);
                              }}
                              className="p-2 hover:bg-black/5 rounded-lg transition-colors text-gray-400 hover:text-black"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                if (order.refund_status === 'Refunded') return;
                                setOrderToDelete(order.id);
                                setDeleteError(null);
                                setIsDeleteModalOpen(true);
                              }}
                              disabled={order.refund_status === 'Refunded'}
                              className={cn(
                                "p-2 rounded-lg transition-colors",
                                order.refund_status === 'Refunded' 
                                  ? "text-gray-200 cursor-not-allowed" 
                                  : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                              )}
                              title={order.refund_status === 'Refunded' ? "Completed orders cannot be deleted" : "Delete Order"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Orders List - Mobile */}
            <div className="sm:hidden space-y-4">
              {filteredOrders.map((order) => (
                <div key={order.id} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">{order.id}</span>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-lg leading-tight">{order.account_name}</h4>
                        {order.deal_source && order.deal_source !== 'Direct' && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">{order.deal_source}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{order.platform} • {format(parseISO(order.order_date), "MMM dd, yyyy")}</p>
                      {order.mediator_name && (
                        <p className="text-[10px] text-indigo-500 font-semibold uppercase mt-1">Mediator: {order.mediator_name}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-black/5">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Amount</p>
                      <p className="font-bold text-sm">₹{order.order_amount.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Less</p>
                      <p className="font-bold text-sm text-gray-500">₹{(order.less_amount || 0).toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Refund Amount</p>
                      <p className="font-bold text-sm text-emerald-600">₹{order.refund_amount.toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Refund Status</span>
                      <button 
                        onClick={() => handleToggleRefundStatus(order)}
                        className="hover:opacity-80 transition-opacity"
                      >
                        <StatusBadge status={order.refund_status} />
                      </button>
                      {order.refund_date && (
                        <span className="text-[9px] text-gray-400 font-medium">
                          {order.refund_date}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleToggleFormStatus(order)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5",
                          order.refund_form_status === "Submitted" 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                            : "bg-red-50 text-red-600 border-red-200"
                        )}
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          order.refund_form_status === "Submitted" ? "bg-emerald-500" : "bg-red-500"
                        )} />
                        Refund Form: {order.refund_form_status}
                      </button>
                      {order.refund_form_date && (
                        <span className="text-[9px] text-gray-400 font-medium">
                          Filled: {order.refund_form_date}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setEditingOrder(order);
                          setIsModalOpen(true);
                        }}
                        className="p-2 bg-gray-50 rounded-lg text-gray-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          if (order.refund_status === 'Refunded') return;
                          setOrderToDelete(order.id);
                          setDeleteError(null);
                          setIsDeleteModalOpen(true);
                        }}
                        disabled={order.refund_status === 'Refunded'}
                        className={cn(
                          "p-2 rounded-lg",
                          order.refund_status === 'Refunded' 
                            ? "text-gray-200" 
                            : "bg-red-50 text-red-600"
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredOrders.length === 0 && (
              <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-12 text-center text-gray-400">
                No orders found matching your criteria.
              </div>
            )}
            {/* Data Management Section */}
            <div className="mt-12 bg-white rounded-3xl border border-black/5 shadow-sm p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Database className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Data Management</h3>
                  <p className="text-sm text-gray-500">Backup or restore your tracking data</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={handleBackup}
                  className="flex items-center justify-between p-6 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                      <Download className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold">Backup Data</p>
                      <p className="text-xs text-gray-500">Download all records as JSON</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </button>

                <div className="relative">
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleRestore}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isRestoring}
                  />
                  <div className={cn(
                    "flex items-center justify-between p-6 bg-gray-50 rounded-2xl transition-all group",
                    isRestoring ? "opacity-50" : "hover:bg-gray-100"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">{isRestoring ? "Restoring..." : "Restore Data"}</p>
                        <p className="text-xs text-gray-500">Upload a previous backup file</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Note:</strong> Data is stored in a local database on the server. To ensure you never lose your records, we recommend downloading a backup periodically, especially before clearing your browser cache or if you notice any environment resets.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl h-full sm:h-auto sm:rounded-3xl shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 bg-white px-6 sm:px-8 py-4 sm:py-6 border-b border-black/5 flex justify-between items-center z-10">
                <h2 className="text-xl font-bold">{editingOrder ? "Edit Order" : "New Order Entry"}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSaveOrder} className="p-6 sm:p-8 space-y-6">
                {formError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm"
                  >
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {formError}
                  </motion.div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</label>
                    <input 
                      name="id"
                      required
                      defaultValue={editingOrder?.id}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                      placeholder="e.g. AMZ-12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform</label>
                    <select 
                      name="platform"
                      required
                      defaultValue={editingOrder?.platform ?? "Amazon"}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                    >
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deal Source</label>
                    <select 
                      name="deal_source"
                      required
                      defaultValue={editingOrder?.deal_source ?? "Direct"}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                    >
                      {DEAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Date</label>
                    <input 
                      name="order_date"
                      type="date"
                      required
                      defaultValue={editingOrder?.order_date ?? format(new Date(), "yyyy-MM-dd")}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name</label>
                    <input 
                      name="account_name"
                      required
                      defaultValue={editingOrder?.account_name}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                      placeholder="User Account"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Amount (₹)</label>
                    <input 
                      name="order_amount"
                      type="number"
                      step="0.01"
                      required
                      value={formValues.order_amount || ""}
                      onChange={(e) => handleAmountChange('order_amount', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Less (₹)</label>
                    <input 
                      name="less_amount"
                      type="number"
                      step="0.01"
                      value={formValues.less_amount || ""}
                      onChange={(e) => handleAmountChange('less_amount', e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                      placeholder="Amount to subtract"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Refund Amount (₹)</label>
                    <div className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-bold">
                      ₹{formValues.refund_amount.toFixed(2)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mediator Name</label>
                    <div className="flex flex-col gap-2">
                      <select 
                        value={selectedMediator}
                        onChange={(e) => setSelectedMediator(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                      >
                        {MEDIATORS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {selectedMediator === "Other" && (
                        <input 
                          value={customMediator}
                          onChange={(e) => setCustomMediator(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all"
                          placeholder="Enter mediator name"
                          required
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                  <textarea 
                    name="notes"
                    defaultValue={editingOrder?.notes}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black/5 transition-all resize-none"
                    placeholder="Additional details..."
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingOrder ? "Update Order" : "Save Order"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Delete Order?</h3>
              <p className="text-gray-500 text-sm mb-4">This action cannot be undone. Are you sure you want to remove this order from your records?</p>
              
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs mb-6">
                  {deleteError}
                </div>
              )}
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteOrder}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricCard({ label, value, icon, trend }: { label: string; value: string | number; icon: React.ReactNode; trend?: "positive" | "negative" }) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-black/5 shadow-sm flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="p-2 bg-gray-50 rounded-xl">
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
            trend === "positive" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          )}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RefundStatus }) {
  const styles = {
    "Not Started": "bg-red-50 text-red-600 border-red-100",
    "Processing": "bg-amber-50 text-amber-600 border-amber-100",
    "Refunded": "bg-emerald-50 text-emerald-600 border-emerald-100",
  };

  return (
    <span className={cn(
      "px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider w-fit",
      styles[status]
    )}>
      {status}
    </span>
  );
}
