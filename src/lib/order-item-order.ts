import type { Prisma } from "@prisma/client";

/** Same item order as the main app (consignment/src/lib/order-item-order.ts): box order. */
export const ORDER_ITEMS_ORDER_BY: Prisma.OrderItemOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

/** `include: { items: ORDERED_ITEMS }` */
export const ORDERED_ITEMS = { orderBy: ORDER_ITEMS_ORDER_BY };
