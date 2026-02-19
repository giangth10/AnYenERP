import dayjs from "dayjs";

export function getDeliveryDateWithBusinessRule(invoiceDate: string | Date): string {
  let deliveryDate = dayjs(invoiceDate).add(100, "day");
  const day = deliveryDate.day();

  if (day === 6) {
    deliveryDate = deliveryDate.add(2, "day");
  } else if (day === 0) {
    deliveryDate = deliveryDate.add(1, "day");
  }

  return deliveryDate.format("YYYY-MM-DD");
}

export function getPeriodRange(period: "day" | "week" | "month") {
  const now = dayjs();
  if (period === "day") {
    return { from: now.startOf("day").toISOString(), to: now.endOf("day").toISOString() };
  }
  if (period === "week") {
    return { from: now.startOf("week").toISOString(), to: now.endOf("week").toISOString() };
  }
  return { from: now.startOf("month").toISOString(), to: now.endOf("month").toISOString() };
}
