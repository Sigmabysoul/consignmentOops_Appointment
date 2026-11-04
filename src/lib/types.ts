export type Role = "ADMIN" | "MANAGER" | "STAFF" | "TL";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  department: string | null;
  isLogisticsAuthorized: boolean;
}

export type ShipmentStatus =
  | "Pending"
  | "Tracking Assigned"
  | "In Transit"
  | "Appointment Scheduled"
  | "Delivered"
  | "GRN Issue"
  | "Cancelled";

export interface AppointmentOrder {
  id: string;
  channel: string;
  roPoNumber: string;
  warehouseName: string | null;
  invoiceNo: string | null;
  status: string | null;
  courierStatus: string | null;
  trackingStatus: string | null;
  trackingId: string | null;
  courierPartner: string | null;
  trackingLink: string | null;
  appointmentId: string | null;
  appointmentDate: string | null;
  appointmentSlot: string | null;
  deliveryDate: string | null;
  pickupDate: string | null;
  pickupDone: boolean;
  boxCount: number | null;
  boxDimensions: string | null;
  weightKg: number | null;
  comment: string | null;
  grnStatus: string | null;
  grnReport: string | null;
  orderDate: string | null;
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy?: string | null;
  deliveryStatus?: string | null;
  client?: {
    id: string;
    name: string;
    code: string;
    city: string | null;
  } | null;
  items?: Array<{
    id: string;
    itemName: string | null;
    totalQty: number | null;
    boxCount: number | null;
  }>;
  statusHistory?: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    userName: string | null;
    userRole: string | null;
    reason: string | null;
    timestamp: string;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    fieldChanged: string | null;
    oldValue: string | null;
    newValue: string | null;
    userName: string | null;
    timestamp: string;
  }>;
}

export interface CourierPresetItem {
  id: string;
  name: string;
  urlName: string;
  trackingUrlPattern: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface DashboardStats {
  totalOrders: number;
  trackingMissing: number;
  inTransit: number;
  appointmentScheduled: number;
  scheduledToday: number;
  delivered: number;
  grnIssues: number;
  pending: number;
  cancelled: number;
}

