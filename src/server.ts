import express from "express";
import cors from "cors";
import { z } from "zod";
import "dotenv/config";
import { supabase } from "./lib/supabase.js";
import { getDeliveryDateWithBusinessRule, getPeriodRange } from "./lib/date.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_, res) => res.json({ ok: true, service: "An Yên Silver ERP" }));

app.use("/api", (req, res, next) => {
  const role = req.header("x-user-role");
  if (!role || !["admin", "sale"].includes(role)) {
    return res.status(401).json({ message: "Thiếu quyền. Cần header x-user-role: admin hoặc sale." });
  }
  return next();
});

const customerSchema = z.object({
  customer_code: z.string(),
  full_name: z.string(),
  phone: z.string(),
  address: z.string(),
  citizen_id: z.string()
});

app.post("/api/customers", async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { data, error } = await supabase.from("customers").insert(parsed.data).select().single();
  if (error) return res.status(400).json({ message: error.message });
  return res.status(201).json(data);
});

const productSchema = z.object({
  product_code: z.string(),
  name: z.string(),
  weight_gram: z.number().positive()
});

app.post("/api/products", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { data, error } = await supabase.from("products").insert(parsed.data).select().single();
  if (error) return res.status(400).json({ message: error.message });
  return res.status(201).json(data);
});

const purchaseOrderSchema = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative()
});

app.post("/api/purchase-orders", async (req, res) => {
  const parsed = purchaseOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({ ...parsed.data, status: "pending_delivery" })
    .select()
    .single();

  if (orderError) return res.status(400).json({ message: orderError.message });

  const { data: inventory, error: invError } = await supabase
    .from("inventory")
    .select("pending_qty,total_qty")
    .eq("product_id", parsed.data.product_id)
    .maybeSingle();

  if (invError) return res.status(400).json({ message: invError.message });

  const pending = (inventory?.pending_qty ?? 0) + parsed.data.qty;
  const total = (inventory?.total_qty ?? 0) + parsed.data.qty;

  const { error: upsertError } = await supabase.from("inventory").upsert({
    product_id: parsed.data.product_id,
    pending_qty: pending,
    total_qty: total
  });

  if (upsertError) return res.status(400).json({ message: upsertError.message });

  return res.status(201).json({ ...order, stock_updated: true });
});

const saleOrderSchema = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  sale_type: z.enum(["physical", "pending"])
});

app.post("/api/sales-orders", async (req, res) => {
  const parsed = saleOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { data: stock, error: stockErr } = await supabase
    .from("inventory")
    .select("physical_qty,pending_qty,total_qty")
    .eq("product_id", parsed.data.product_id)
    .single();

  if (stockErr) return res.status(400).json({ message: stockErr.message });

  const checkQty = parsed.data.sale_type === "physical" ? stock.physical_qty : stock.pending_qty;
  const projected = checkQty - parsed.data.qty;

  if (projected < -50) {
    return res.status(400).json({
      message: "Không thể tạo đơn bán: âm kho vượt quá 50 sản phẩm theo quy định."
    });
  }

  const invoiceDate = new Date().toISOString().slice(0, 10);
  const deliveryDate = parsed.data.sale_type === "pending" ? getDeliveryDateWithBusinessRule(invoiceDate) : null;

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      ...parsed.data,
      require_vat_invoice: parsed.data.sale_type === "physical",
      delivery_date: deliveryDate
    })
    .select()
    .single();

  if (orderErr) return res.status(400).json({ message: orderErr.message });

  const physical_qty = parsed.data.sale_type === "physical" ? stock.physical_qty - parsed.data.qty : stock.physical_qty;
  const pending_qty = parsed.data.sale_type === "pending" ? stock.pending_qty - parsed.data.qty : stock.pending_qty;

  const { error: updateErr } = await supabase
    .from("inventory")
    .update({ physical_qty, pending_qty, total_qty: physical_qty + pending_qty })
    .eq("product_id", parsed.data.product_id);

  if (updateErr) return res.status(400).json({ message: updateErr.message });
  return res.status(201).json(order);
});

const procurementSchema = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  procurement_type: z.enum(["physical", "invoice"]),
  linked_sale_order_id: z.string().uuid().optional()
});

app.post("/api/procurements", async (req, res) => {
  const parsed = procurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  if (parsed.data.procurement_type === "invoice" && !parsed.data.linked_sale_order_id) {
    return res.status(400).json({ message: "Thu mua hóa đơn phải liên kết hóa đơn bán hàng." });
  }

  const { data, error } = await supabase
    .from("procurements")
    .insert({ ...parsed.data, require_vat_invoice: parsed.data.procurement_type === "invoice" })
    .select()
    .single();

  if (error) return res.status(400).json({ message: error.message });

  const { data: stock, error: invErr } = await supabase
    .from("inventory")
    .select("physical_qty,pending_qty")
    .eq("product_id", parsed.data.product_id)
    .single();

  if (invErr) return res.status(400).json({ message: invErr.message });

  const physical_qty = stock.physical_qty + parsed.data.qty;
  const { error: updateErr } = await supabase
    .from("inventory")
    .update({ physical_qty, total_qty: physical_qty + stock.pending_qty })
    .eq("product_id", parsed.data.product_id);

  if (updateErr) return res.status(400).json({ message: updateErr.message });

  return res.status(201).json(data);
});

app.get("/api/reports/revenue", async (req, res) => {
  const period = (req.query.period as "day" | "week" | "month") ?? "day";
  const range = getPeriodRange(period);

  const { data, error } = await supabase
    .from("sales_orders")
    .select("qty,unit_price,created_at")
    .gte("created_at", range.from)
    .lte("created_at", range.to);

  if (error) return res.status(400).json({ message: error.message });

  const revenue = (data ?? []).reduce((sum, row) => sum + row.qty * row.unit_price, 0);
  return res.json({ period, from: range.from, to: range.to, revenue });
});

app.post("/api/import/legacy-inventory", async (req, res) => {
  const schema = z.array(
    z.object({
      product_id: z.string().uuid(),
      physical_qty: z.number().int(),
      pending_qty: z.number().int(),
      avg_cost_vnd_per_gram: z.number().nonnegative().default(0)
    })
  );

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const rows = parsed.data.map((item) => ({ ...item, total_qty: item.physical_qty + item.pending_qty }));
  const { error } = await supabase.from("inventory").upsert(rows);
  if (error) return res.status(400).json({ message: error.message });
  return res.json({ imported: rows.length });
});

app.post("/api/import/legacy-orders", async (req, res) => {
  const schema = z.object({
    sales_orders: z.array(z.any()).default([]),
    purchase_orders: z.array(z.any()).default([])
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  if (parsed.data.sales_orders.length > 0) {
    const { error } = await supabase.from("sales_orders").insert(parsed.data.sales_orders);
    if (error) return res.status(400).json({ message: error.message });
  }

  if (parsed.data.purchase_orders.length > 0) {
    const { error } = await supabase.from("purchase_orders").insert(parsed.data.purchase_orders);
    if (error) return res.status(400).json({ message: error.message });
  }

  return res.json({
    imported_sales_orders: parsed.data.sales_orders.length,
    imported_purchase_orders: parsed.data.purchase_orders.length
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`An Yên Silver ERP API running on port ${port}`);
});
