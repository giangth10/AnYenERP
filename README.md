# An Yên Silver ERP (Supabase + TypeScript)

Hệ thống ERP đơn giản cho đại lý **Ancarat / An Yên Silver** để quản lý mua bán bạc, tồn kho và báo cáo doanh thu.

## 1) Chức năng đã triển khai

- Quản lý kho 3 lớp:
  - `Kho vật chất` (`inventory.physical_qty`)
  - `Kho chờ` (`inventory.pending_qty`)
  - `Kho tổng` (`inventory.total_qty = physical_qty + pending_qty`)
- Mua hàng (`/api/purchase-orders`): tăng kho chờ và kho tổng.
- Bán hàng (`/api/sales-orders`):
  - Bán vật chất: yêu cầu VAT (`require_vat_invoice = true`)
  - Bán hàng chờ: tự động tính ngày hẹn giao = ngày hóa đơn + 100 ngày, dời sang thứ 2 nếu rơi vào T7/CN.
- Thu mua (`/api/procurements`):
  - Thu mua vật chất.
  - Thu mua hóa đơn: bắt buộc liên kết hóa đơn bán (`linked_sale_order_id`) và yêu cầu VAT.
- Kiểm soát âm kho: nếu tồn bị âm quá 50 sản phẩm thì từ chối tạo đơn bán.
- Quản lý khách hàng, sản phẩm, người dùng (admin/sale).
- Báo cáo doanh thu theo ngày/tuần/tháng (`/api/reports/revenue?period=day|week|month`).
- Đồng bộ dữ liệu cũ:
  - `/api/import/legacy-inventory`
  - `/api/import/legacy-orders`

## 2) Công nghệ sử dụng

- Backend: Node.js + TypeScript + Express
- CSDL: Supabase Postgres
- Validate dữ liệu: Zod

---

## 3) Triển khai nhanh trên máy local (Visual Studio Code)

### Bước 1: Chuẩn bị

- Cài Node.js 20+
- Cài VS Code
- Tạo dự án Supabase (lấy `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`)

### Bước 2: Cài đặt source

```bash
git clone <repo-url>
cd AnYenERP
npm install
cp .env.example .env
```

Mở `.env` và điền:

```env
PORT=4000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Bước 3: Tạo database schema

- Mở Supabase Dashboard → **SQL Editor**
- Chạy toàn bộ file: `supabase/migrations/001_init.sql`

### Bước 4: Chạy server

```bash
npm run dev
```

Kiểm tra:

```bash
curl -X GET http://localhost:4000/health
```

Nếu OK sẽ trả về:

```json
{ "ok": true, "service": "An Yên Silver ERP" }
```

---

## 4) Triển khai production (gợi ý: Render/Railway/Fly.io)

### A. Chuẩn bị

- Push code lên GitHub/GitLab.
- Tạo service Node.js trên nền tảng deploy.

### B. Cấu hình môi trường

Thiết lập biến môi trường:

- `PORT` (đa số nền tảng tự cấp)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### C. Build/Start command

- Build: `npm run build`
- Start: `npm run start`

### D. Lưu ý bảo mật

- `SUPABASE_SERVICE_ROLE_KEY` là khóa quyền cao: chỉ dùng phía server, tuyệt đối không đưa ra frontend công khai.
- Nên bật IP restriction (nếu có) và rotation key định kỳ.

---

## 5) Cách sử dụng ERP theo quy trình nghiệp vụ

> Tất cả endpoint `/api/*` cần header:
>
> - `x-user-role: admin` hoặc
> - `x-user-role: sale`

## 5.1 Tạo master data

### 1) Tạo khách hàng

```bash
curl -X POST http://localhost:4000/api/customers \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '{
    "customer_code":"KH001",
    "full_name":"Nguyễn Văn A",
    "phone":"0900000000",
    "address":"Đà Lạt",
    "citizen_id":"012345678901"
  }'
```

### 2) Tạo sản phẩm

```bash
curl -X POST http://localhost:4000/api/products \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '{
    "product_code":"SP001",
    "name":"Nhẫn bạc 925",
    "weight_gram":3.5
  }'
```

## 5.2 Nhập dữ liệu kho cũ (nếu có)

```bash
curl -X POST http://localhost:4000/api/import/legacy-inventory \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '[
    {
      "product_id":"<uuid-product>",
      "physical_qty":100,
      "pending_qty":20,
      "avg_cost_vnd_per_gram":780000
    }
  ]'
```

## 5.3 Đặt hàng (mua từ Ancarat, vào kho chờ)

```bash
curl -X POST http://localhost:4000/api/purchase-orders \
  -H "Content-Type: application/json" \
  -H "x-user-role: sale" \
  -d '{
    "product_id":"<uuid-product>",
    "customer_id":"<uuid-customer>",
    "qty":10,
    "unit_price":900000
  }'
```

Kết quả: tăng `pending_qty` và `total_qty`.

## 5.4 Bán hàng

### A. Bán vật chất

```bash
curl -X POST http://localhost:4000/api/sales-orders \
  -H "Content-Type: application/json" \
  -H "x-user-role: sale" \
  -d '{
    "product_id":"<uuid-product>",
    "customer_id":"<uuid-customer>",
    "qty":2,
    "unit_price":950000,
    "sale_type":"physical"
  }'
```

- Hệ thống tự bật `require_vat_invoice = true`.

### B. Bán hàng chờ

```bash
curl -X POST http://localhost:4000/api/sales-orders \
  -H "Content-Type: application/json" \
  -H "x-user-role: sale" \
  -d '{
    "product_id":"<uuid-product>",
    "customer_id":"<uuid-customer>",
    "qty":2,
    "unit_price":940000,
    "sale_type":"pending"
  }'
```

- Hệ thống tự tính `delivery_date = invoice_date + 100 ngày`, nếu rơi T7/CN sẽ dời sang thứ 2.

## 5.5 Thu mua

### A. Thu mua vật chất

```bash
curl -X POST http://localhost:4000/api/procurements \
  -H "Content-Type: application/json" \
  -H "x-user-role: sale" \
  -d '{
    "product_id":"<uuid-product>",
    "customer_id":"<uuid-customer>",
    "qty":5,
    "unit_price":870000,
    "procurement_type":"physical"
  }'
```

### B. Thu mua hóa đơn

```bash
curl -X POST http://localhost:4000/api/procurements \
  -H "Content-Type: application/json" \
  -H "x-user-role: sale" \
  -d '{
    "product_id":"<uuid-product>",
    "customer_id":"<uuid-customer>",
    "qty":3,
    "unit_price":860000,
    "procurement_type":"invoice",
    "linked_sale_order_id":"<uuid-sale-order>"
  }'
```

- Nếu thiếu `linked_sale_order_id` sẽ bị từ chối.
- Hệ thống tự bật `require_vat_invoice = true`.

## 5.6 Báo cáo doanh thu

```bash
curl -X GET "http://localhost:4000/api/reports/revenue?period=day" -H "x-user-role: admin"
curl -X GET "http://localhost:4000/api/reports/revenue?period=week" -H "x-user-role: admin"
curl -X GET "http://localhost:4000/api/reports/revenue?period=month" -H "x-user-role: admin"
```

---

## 6) Đồng bộ đơn hàng cũ

```bash
curl -X POST http://localhost:4000/api/import/legacy-orders \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '{
    "sales_orders": [],
    "purchase_orders": []
  }'
```

---

## 7) Thông tin doanh nghiệp đã cố định trong schema

- Công ty: **Công ty TNHH MTV Bạc An Yên**
- MST: **5801550903**
- Địa chỉ: **11B Lữ Gia, Phường Lâm Viên - Đà Lạt, Tỉnh Lâm Đồng**
- SĐT: **0845354222**

(Được khai báo trong view `company_profile`.)
