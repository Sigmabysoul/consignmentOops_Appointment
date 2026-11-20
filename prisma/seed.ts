import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Development seed with well-known passwords. Never run it against a production database.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "true") {
    throw new Error("Refusing to run the development seed (known passwords) with NODE_ENV=production.");
  }

  console.log("🌱 Seeding appointment & consignment database...");

  // 1. Password Hashes
  const adminHash = await bcrypt.hash("admin123", 10);
  const iqbalHash = await bcrypt.hash("iqbal123", 10);
  const dispatchHash = await bcrypt.hash("dispatch123", 10);

  // 2. Users — created only when missing; an existing account is never reset
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {}, // existing users (shared with the main app) keep their password and permissions
    create: {
      username: "admin",
      name: "System Administrator",
      passwordHash: adminHash,
      department: "Management",
      globalPermissions: ["users.manage", "settings.couriers"],
    },
  });

  const iqbal = await prisma.user.upsert({
    where: { username: "iqbal" },
    update: {}, // existing users (shared with the main app) keep their password and permissions
    create: {
      username: "iqbal",
      name: "Mohammad Iqbal",
      passwordHash: iqbalHash,
      department: "Logistics",
    },
  });

  const dispatch = await prisma.user.upsert({
    where: { username: "dispatch" },
    update: {}, // existing users (shared with the main app) keep their password and permissions
    create: {
      username: "dispatch",
      name: "Logistics & Dispatch Desk",
      passwordHash: dispatchHash,
      department: "Dispatch",
    },
  });

  // Dev grants for NEW accounts only (existing accounts keep whatever Admin → Users gave them).
  const platforms = await prisma.platform.findMany({ select: { code: true } });
  const deskActions = ["order.view", "logistics.desk", "courier.book", "delivery.mark", "tracking.manage"];
  const grants: Array<[string, string[]]> = [
    [admin.id, [...deskActions, "order.override", "labels.manage"]],
    [iqbal.id, deskActions],
    [dispatch.id, deskActions],
  ];
  for (const [userId, actions] of grants) {
    for (const p of platforms) {
      await prisma.channelPermission.upsert({
        where: { userId_channel: { userId, channel: p.code } },
        update: {},
        create: { userId, channel: p.code, actions, allowedFields: [] },
      });
    }
  }

  console.log("👤 Ensured users exist (created if missing): admin, iqbal, dispatch");

  // 3. Courier presets this app needs. CourierPreset is shared with the main app (it also keeps
  //    e.g. "Shiprocket Cargo", "Ekart Logistics", "Local"), so the seed only upserts its own rows
  //    and never deletes anything.
  const couriers = [
    { name: "OM Logistics", urlName: "om-logistics", trackingUrlPattern: "https://trackcourier.io/track-and-trace/om-logistics/{trackingId}", sortOrder: 1 },
    { name: "Delhivery One", urlName: "delhivery-courier", trackingUrlPattern: "https://trackcourier.io/track-and-trace/delhivery-courier/{trackingId}", sortOrder: 2 },
    { name: "Ekart", urlName: "ekart-logistics", trackingUrlPattern: "https://trackcourier.io/track-and-trace/ekart-logistics/{trackingId}", sortOrder: 3 },
    { name: "Amazon ATS", urlName: "amazon-ats", trackingUrlPattern: "https://trackcourier.io/track-and-trace/amazon-ats/{trackingId}", sortOrder: 4 },
  ];

  for (const cr of couriers) {
    const existing = await prisma.courierPreset.findFirst({ where: { name: cr.name } });
    if (!existing) {
      await prisma.courierPreset.create({
        data: {
          name: cr.name,
          urlName: cr.urlName,
          trackingUrlPattern: cr.trackingUrlPattern,
          sortOrder: cr.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.courierPreset.update({
        where: { id: existing.id },
        data: {
          urlName: cr.urlName,
          trackingUrlPattern: cr.trackingUrlPattern,
          sortOrder: cr.sortOrder,
          isActive: true,
        },
      });
    }
  }
  console.log("🚚 Upserted courier presets: OM Logistics, Delhivery One, Ekart, Amazon ATS (others untouched)");

  // 4. Sample Consignment Orders with Box Dimensions & Pickup Data
  const existingOrders = await prisma.consignmentOrder.count();
  if (existingOrders === 0) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await prisma.consignmentOrder.create({
      data: {
        roPoNumber: "PO-SWIGGY-BLR-101",
        channel: "SWIGGY",
        warehouseName: "Swiggy Instamart Mother Hub - Bangalore East",
        status: "Pending",
        courierStatus: "Pending",
        boxCount: 3,
        lengthCm: 23,
        widthCm: 40,
        heightCm: 25,
        weightKg: 12.5,
        remainderQty: 1,
        remainderLengthCm: 15,
        remainderWidthCm: 20,
        remainderHeightCm: 10,
        remainderWeightKg: 3.5,
        pickupDone: false,
        pickupDate: today,
        courierPartner: "Delhivery One",
        invoiceNo: "INV-2026-001",
      },
    });

    await prisma.consignmentOrder.create({
      data: {
        roPoNumber: "PO-BLINKIT-DEL-204",
        channel: "BLINKIT",
        warehouseName: "Blinkit Central Dark Store - Gurugram Hub 3",
        status: "In Transit",
        courierStatus: "In Transit",
        trackingId: "CN-DELH-98765432",
        appointmentId: "APPT-BLK-771",
        appointmentDate: tomorrow,
        appointmentSlot: "10:00 AM - 01:00 PM",
        boxCount: 5,
        lengthCm: 30,
        widthCm: 50,
        heightCm: 35,
        weightKg: 22.0,
        pickupDone: true,
        pickupDate: today,
        courierPartner: "Blue Dart",
        invoiceNo: "INV-2026-002",
      },
    });

    await prisma.consignmentOrder.create({
      data: {
        roPoNumber: "PO-FLIPKART-BOM-309",
        channel: "FLIPKART",
        warehouseName: "Flipkart Grocery FC - Bhiwandi West",
        status: "Delivered",
        courierStatus: "Delivered",
        trackingId: "CN-OML-55443322",
        deliveryDate: today,
        appointmentDate: today,
        appointmentSlot: "02:00 PM - 05:00 PM",
        boxCount: 4,
        lengthCm: 25,
        widthCm: 45,
        heightCm: 30,
        weightKg: 18.0,
        pickupDone: true,
        courierPartner: "OM Logistics",
        invoiceNo: "INV-2026-003",
      },
    });

    await prisma.consignmentOrder.create({
      data: {
        roPoNumber: "PO-AMAZON-HYD-412",
        channel: "AMAZON",
        warehouseName: "Amazon HYD8 Fulfillment Center",
        status: "GRN Issue",
        courierStatus: "GRN Issue",
        grnStatus: "GRN Issue",
        grnReport: "Shortage of 2 cartons reported at dock gate 3",
        trackingId: "CN-SMARTR-112233",
        appointmentDate: today,
        boxCount: 2,
        lengthCm: 20,
        widthCm: 35,
        heightCm: 20,
        weightKg: 8.5,
        pickupDone: true,
        courierPartner: "Smartr Logistics",
        invoiceNo: "INV-2026-004",
      },
    });

    console.log("📦 Created sample consignment orders with box dimensions & pickup data");
  }

  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
