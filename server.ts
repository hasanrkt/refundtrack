import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("orders.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    deal_source TEXT DEFAULT 'Direct',
    order_date TEXT NOT NULL,
    account_name TEXT NOT NULL,
    order_amount REAL NOT NULL,
    less_amount REAL DEFAULT 0,
    refund_amount REAL DEFAULT 0,
    mediator_name TEXT,
    refund_form_status TEXT NOT NULL,
    refund_form_date TEXT,
    refund_status TEXT NOT NULL,
    refund_date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration for existing database
try {
  db.prepare("ALTER TABLE orders ADD COLUMN less_amount REAL DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE orders ADD COLUMN deal_source TEXT DEFAULT 'Direct'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE orders ADD COLUMN refund_form_date TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE orders ADD COLUMN refund_date TEXT").run();
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/orders", (req, res) => {
    try {
      const orders = db.prepare("SELECT * FROM orders ORDER BY order_date DESC").all();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/orders", (req, res) => {
    const {
      id,
      platform,
      deal_source,
      order_date,
      account_name,
      order_amount,
      less_amount,
      refund_amount,
      mediator_name,
      refund_form_status,
      refund_form_date,
      refund_status,
      refund_date,
      notes,
    } = req.body;

    // Basic validation
    if (!id || !platform || !order_date || !account_name || isNaN(order_amount)) {
      return res.status(400).json({ error: "Missing required fields or invalid amounts" });
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO orders (id, platform, deal_source, order_date, account_name, order_amount, less_amount, refund_amount, mediator_name, refund_form_status, refund_form_date, refund_status, refund_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id, 
        platform, 
        deal_source || 'Direct',
        order_date, 
        account_name, 
        order_amount, 
        less_amount || 0,
        refund_amount || 0, 
        mediator_name || null, 
        refund_form_status || 'Pending',
        refund_form_date || null,
        refund_status, 
        refund_date || null,
        notes || null
      );
      res.status(201).json({ success: true });
    } catch (error: any) {
      console.error("Database Error (POST):", error);
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return res.status(400).json({ error: "Order ID already exists. Please use a unique ID." });
      }
      res.status(500).json({ error: "Failed to create order: " + error.message });
    }
  });

  app.put("/api/orders/:id", (req, res) => {
    const { id: oldId } = req.params;
    const {
      id: newId,
      platform,
      deal_source,
      order_date,
      account_name,
      order_amount,
      less_amount,
      refund_amount,
      mediator_name,
      refund_form_status,
      refund_form_date,
      refund_status,
      refund_date,
      notes,
    } = req.body;

    try {
      const stmt = db.prepare(`
        UPDATE orders SET
          id = ?,
          platform = ?,
          deal_source = ?,
          order_date = ?,
          account_name = ?,
          order_amount = ?,
          less_amount = ?,
          refund_amount = ?,
          mediator_name = ?,
          refund_form_status = ?,
          refund_form_date = ?,
          refund_status = ?,
          refund_date = ?,
          notes = ?
        WHERE id = ?
      `);
      stmt.run(
        newId || oldId,
        platform,
        deal_source || 'Direct',
        order_date,
        account_name,
        order_amount,
        less_amount || 0,
        refund_amount || 0, 
        mediator_name || null, 
        refund_form_status, 
        refund_form_date || null,
        refund_status, 
        refund_date || null,
        notes || null,
        oldId
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("Database Error (PUT):", error);
      res.status(500).json({ error: "Failed to update order: " + error.message });
    }
  });

  app.patch("/api/orders/:id/toggle-form", (req, res) => {
    const { id } = req.params;
    const { status, date } = req.body;
    try {
      const stmt = db.prepare(`
        UPDATE orders SET 
          refund_form_status = ?,
          refund_form_date = ?
        WHERE id = ?
      `);
      stmt.run(status, date || null, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to toggle form status: " + error.message });
    }
  });

  app.patch("/api/orders/:id/toggle-refund", (req, res) => {
    const { id } = req.params;
    const { status, date } = req.body;
    try {
      const stmt = db.prepare(`
        UPDATE orders SET 
          refund_status = ?,
          refund_date = ?
        WHERE id = ?
      `);
      stmt.run(status, date || null, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to toggle refund status: " + error.message });
    }
  });

  app.delete("/api/orders/:id", (req, res) => {
    const { id } = req.params;
    try {
      // Check if order is already refunded
      const order = db.prepare("SELECT refund_status FROM orders WHERE id = ?").get(id) as any;
      if (order && order.refund_status === 'Refunded') {
        return res.status(400).json({ error: "Completed (Refunded) orders cannot be deleted for record integrity." });
      }
      
      db.prepare("DELETE FROM orders WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete order: " + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
