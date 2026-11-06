import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding appointment & consignment database...");

  // 1. Password Hashes
  const adminHash = await bcrypt.hash("admin123", 10);
  const iqbalHash = await bcrypt.hash("iqbal123", 10);
  const dispatchHash = await bcrypt.hash("dispatch123", 10);

  // 2. Users
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash, role: Role.ADMIN },
    create: {
      username: "admin",
      name: "System Administrator",
      passwordHash: adminHash,
      role: Role.ADMIN,
      department: "Management",
    },
  });

  const iqbal = await prisma.user.upsert({
    where: { username: "iqbal" },
    update: { passwordHash: iqbalHash, role: Role.MANAGER },
    create: {
      username: "iqbal",
      name: "Mohammad Iqbal",
      passwordHash: iqbalHash,
      role: Role.MANAGER,
      department: "Logistics",
    },
  });

  const dispatch = await prisma.user.upsert({
    where: { username: "dispatch" },
    update: { passwordHash: dispatchHash, role: Role.STAFF },
    create: {
      username: "dispatch",
      name: "Logistics & Dispatch Desk",
      passwordHash: dispatchHash,
      role: Role.STAFF,
      department: "Dispatch",
    },
  });

  console.log("👤 Created users: admin, iqbal, dispatch");

  // 3. Couriers Presets
  const couriers = [
    { name: "Delhivery One", urlName: "delhivery-courier", trackingUrlPattern: "https://trackcourier.io/track-and-trace/delhivery-courier/{trackingId}", sortOrder: 1 },
    { name: "Blue Dart", urlName: "blue-dart-tracking", trackingUrlPattern: "https://trackcourier.io/track-and-trace/blue-dart-tracking/{trackingId}", sortOrder: 2 },
    { name: "OM Logistics", urlName: "om-logistics", trackingUrlPattern: "https://trackcourier.io/track-and-trace/om-logistics/{trackingId}", sortOrder: 3 },
    { name: "Smartr Logistics", urlName: "smartr-logistics", trackingUrlPattern: "https://trackcourier.io/track-and-trace/smartr-logistics/{trackingId}", sortOrder: 4 },
    { name: "Kerry Indev", urlName: "kerry-indev", trackingUrlPattern: "https://trackcourier.io/track-and-trace/kerry-indev/{trackingId}", sortOrder: 5 },
    { name: "V-Trans", urlName: "v-trans", trackingUrlPattern: "https://trackcourier.io/track-and-trace/v-trans/{trackingId}", sortOrder: 6 },
    { name: "Gati-KWE", urlName: "gati", trackingUrlPattern: "https://trackcourier.io/track-and-trace/gati/{trackingId}", sortOrder: 7 },
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
    }
  }
  console.log("🚚 Seeded courier presets");

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
