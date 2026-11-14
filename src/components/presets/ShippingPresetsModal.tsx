"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Sliders,
  Truck,
  MapPin,
  DollarSign,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  OmRateRow,
  OmPricingConfig,
  OdaBand,
} from "@/modules/pricing/om-logistics/types";
import { CarrierRatePreset } from "@/modules/pricing/multi-carrier/carrier-comparison-engine";
import { UnifiedShippingPresets } from "@/lib/shipping-presets-storage";
import {
  OmWhatsAppConfig,
  DEFAULT_OM_WHATSAPP_CONFIG,
} from "@/lib/om-whatsapp-booking";
import { ALL_STATES } from "@/modules/pricing/om-logistics/state-zone-mapping";
import { ODA_DISTANCE_BANDS } from "@/modules/pricing/om-logistics/oda-matrix";

interface ShippingPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPresetsUpdated?: () => void;
}

export function ShippingPresetsModal({
  isOpen,
  onClose,
  onPresetsUpdated,
}: ShippingPresetsModalProps) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    "omRates" | "omConfig" | "carriers" | "stateZones" | "oda" | "omWhatsApp"
  >("omRates");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Presets Data States
  const [omRateCard, setOmRateCard] = useState<OmRateRow[]>([]);
  const [omConfig, setOmConfig] = useState<OmPricingConfig | null>(null);
  const [carrierPresets, setCarrierPresets] = useState<CarrierRatePreset[]>([]);
  const [stateZoneMap, setStateZoneMap] = useState<Record<string, string>>({});
  const [odaMatrix, setOdaMatrix] = useState<OdaBand[]>([]);
  const [omWhatsAppConfig, setOmWhatsAppConfig] = useState<OmWhatsAppConfig>(DEFAULT_OM_WHATSAPP_CONFIG);
  const [stateSearch, setStateSearch] = useState("");

  // Load presets on open
  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    fetch("/api/shipping-presets")
      .then((res) => res.json())
      .then((data) => {
        if (data.presets) {
          const p = data.presets as UnifiedShippingPresets;
          setOmRateCard(p.omRateCard || []);
          setOmConfig(p.omConfig || null);
          setCarrierPresets(p.carrierPresets || []);
          setStateZoneMap(p.stateZoneMap || {});
          setOdaMatrix(p.odaMatrix || []);
          setOmWhatsAppConfig(p.omWhatsAppConfig || DEFAULT_OM_WHATSAPP_CONFIG);
        }
      })
      .catch((err) => {
        showToast("Failed to load shipping presets", "error");
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  // Save changes to API
  const handleSave = async () => {
    if (!omConfig) return;

    setIsSaving(true);
    try {
      const payload: Partial<UnifiedShippingPresets> = {
        omRateCard,
        omConfig,
        carrierPresets,
        stateZoneMap,
        odaMatrix,
        omWhatsAppConfig: omWhatsAppConfig || DEFAULT_OM_WHATSAPP_CONFIG,
      };

      const res = await fetch("/api/shipping-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets: payload }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      showToast("Shipping presets & rate cards saved successfully ✓", "success");
      onPresetsUpdated?.();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to save presets", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to Defaults
  const handleResetDefaults = async () => {
    if (!confirm("Reset all rate cards and settings back to OM Logistics August 2026 official defaults?")) {
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch("/api/shipping-presets", {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset");

      if (data.presets) {
        const p = data.presets as UnifiedShippingPresets;
        setOmRateCard(p.omRateCard || []);
        setOmConfig(p.omConfig || null);
        setCarrierPresets(p.carrierPresets || []);
        setStateZoneMap(p.stateZoneMap || {});
        setOdaMatrix(p.odaMatrix || []);
        setOmWhatsAppConfig(p.omWhatsAppConfig || DEFAULT_OM_WHATSAPP_CONFIG);
      }

      showToast("Reset to August 2026 defaults ✓", "success");
      onPresetsUpdated?.();
    } catch (err: any) {
      showToast(err.message || "Failed to reset", "error");
    } finally {
      setIsResetting(false);
    }
  };

  // OM Rate Card Row Handlers
  const handleUpdateRateRow = (idx: number, field: keyof OmRateRow, val: any) => {
    setOmRateCard((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleAddRateRow = () => {
    const newRow: OmRateRow = {
      id: `om-custom-${Date.now()}`,
      zones: ["East", "West"],
      minKg: 251,
      maxKg: 500,
      ratePerKg: 10,
      fuelPercent: 0,
      cnCharge: 0,
      note: "Custom slab",
    };
    setOmRateCard((prev) => [...prev, newRow]);
  };

  const handleDeleteRateRow = (idx: number) => {
    setOmRateCard((prev) => prev.filter((_, i) => i !== idx));
  };

  // Carrier Preset Handlers
  const handleUpdateCarrier = (idx: number, field: keyof CarrierRatePreset, val: any) => {
    setCarrierPresets((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleAddCarrier = () => {
    const newCarrier: CarrierRatePreset = {
      id: `carrier-${Date.now()}`,
      name: "New Courier Partner",
      slug: "new-courier",
      serviceType: "Surface Cargo",
      baseRatePerKg: 9.0,
      minChargeableWeightKg: 20,
      minFreightAmount: 300,
      docketCharge: 100,
      fuelSurchargePercent: 15,
      appointmentFee: 800,
      gstPercent: 18,
      estimatedTransitDays: "5–7 Days",
      isActive: true,
      isCustomCarrier: true,
      note: "Custom partner",
    };
    setCarrierPresets((prev) => [...prev, newCarrier]);
  };

  const handleDeleteCarrier = (idx: number) => {
    setCarrierPresets((prev) => prev.filter((_, i) => i !== idx));
  };

  // Filtered States
  const filteredStates = ALL_STATES.filter((s) =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Main Dialog */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[92vh] animate-scale-in text-slate-800">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/30 flex items-center justify-center border border-violet-400/30">
              <Sliders className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                <span>Shipping & Logistics Presets Manager</span>
                <span className="text-[10px] bg-violet-500/30 text-violet-200 font-bold px-2 py-0.5 rounded-full border border-violet-400/20">
                  Data-Driven Rules
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Configure OM Logistics rate slabs, surcharges, state mappings, and partner carrier rates.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 shrink-0 overflow-x-auto">
          {[
            { id: "omRates", label: "1. OM Logistics Rate Card", icon: Truck },
            { id: "omConfig", label: "2. OM Config & Surcharges", icon: DollarSign },
            { id: "carriers", label: "3. Partner Carriers", icon: Sliders },
            { id: "stateZones", label: "4. State to Zone Mapping", icon: MapPin },
            { id: "oda", label: "5. ODA Distance Matrix", icon: Layers },
            { id: "omWhatsApp", label: "6. OM WhatsApp Booking", icon: MessageSquare },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? "border-violet-600 text-violet-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-violet-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
              <span className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold">Loading active presets...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: OM Rate Card */}
              {activeTab === "omRates" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                        OM Logistics Surface Rate Slabs (Ex Kolkata PIN 700100)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Light slab (≤250 kg) applies fuel % + ₹100 CN. Heavy slabs (&gt;250 kg) are all-inclusive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddRateRow}
                      className="px-2.5 py-1 text-xs font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Slab</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3">Zones</th>
                          <th className="py-2.5 px-2 w-20">Min kg</th>
                          <th className="py-2.5 px-2 w-20">Max kg</th>
                          <th className="py-2.5 px-2 w-24">Rate (₹/kg)</th>
                          <th className="py-2.5 px-2 w-20">Fuel %</th>
                          <th className="py-2.5 px-2 w-20">CN (₹)</th>
                          <th className="py-2.5 px-3">Notes</th>
                          <th className="py-2.5 px-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {omRateCard.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50/80">
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={row.zones.join(", ")}
                                onChange={(e) =>
                                  handleUpdateRateRow(
                                    idx,
                                    "zones",
                                    e.target.value.split(",").map((s) => s.trim())
                                  )
                                }
                                className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                value={row.minKg}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "minKg", parseFloat(e.target.value) || 0)
                                }
                                className="w-16 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-800 font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                value={row.maxKg}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "maxKg", parseFloat(e.target.value) || 0)
                                }
                                className="w-16 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-800 font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                step="0.05"
                                value={row.ratePerKg}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "ratePerKg", parseFloat(e.target.value) || 0)
                                }
                                className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-violet-700 font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                value={row.fuelPercent}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "fuelPercent", parseFloat(e.target.value) || 0)
                                }
                                className="w-16 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-800 font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                value={row.cnCharge}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "cnCharge", parseFloat(e.target.value) || 0)
                                }
                                className="w-16 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-800 font-mono"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={row.note || ""}
                                onChange={(e) =>
                                  handleUpdateRateRow(idx, "note", e.target.value)
                                }
                                className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-600"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteRateRow(idx)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: OM Config & Surcharges */}
              {activeTab === "omConfig" && omConfig && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                      OM Logistics Surcharges & Global Constants
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Standard commercial parameters used across all calculations.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        GST Rate (%)
                      </label>
                      <input
                        type="number"
                        value={omConfig.gstPercent}
                        onChange={(e) =>
                          setOmConfig({ ...omConfig, gstPercent: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Air Express Rate (₹/kg)
                      </label>
                      <input
                        type="number"
                        value={omConfig.airExpressRatePerKg}
                        onChange={(e) =>
                          setOmConfig({
                            ...omConfig,
                            airExpressRatePerKg: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Appointment Min Charge (₹)
                      </label>
                      <input
                        type="number"
                        value={omConfig.appointmentMinFee}
                        onChange={(e) =>
                          setOmConfig({
                            ...omConfig,
                            appointmentMinFee: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Base minimum applied up to threshold weight
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Appointment Per-Kg Rate (₹/kg)
                      </label>
                      <input
                        type="number"
                        value={omConfig.appointmentPerKgFee}
                        onChange={(e) =>
                          setOmConfig({
                            ...omConfig,
                            appointmentPerKgFee: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Applied when weight exceeds threshold
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ROV Shipper's Risk (%)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={omConfig.rovShipperRiskPercent}
                        onChange={(e) =>
                          setOmConfig({
                            ...omConfig,
                            rovShipperRiskPercent: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Default: 0.3% (Min ₹{omConfig.rovShipperRiskMin})
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ROV Carrier's Risk (%)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        value={omConfig.rovCarrierRiskPercent}
                        onChange={(e) =>
                          setOmConfig({
                            ...omConfig,
                            rovCarrierRiskPercent: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Default: 0.8% (Min ₹{omConfig.rovCarrierRiskMin})
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        OM Transporter ID
                      </label>
                      <input
                        type="text"
                        value={omConfig.transporterId}
                        onChange={(e) =>
                          setOmConfig({ ...omConfig, transporterId: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-slate-900 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Pickup Facility PIN
                      </label>
                      <input
                        type="text"
                        value={omConfig.pickupPin}
                        onChange={(e) =>
                          setOmConfig({ ...omConfig, pickupPin: e.target.value })
                        }
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-slate-900 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Partner Carriers */}
              {activeTab === "carriers" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                        Configured Partner Carriers for Shipping Comparison
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Adjust partner base rates, docket charges, and fuel surcharges.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCarrier}
                      className="px-2.5 py-1 text-xs font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Carrier</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {carrierPresets.map((carrier, idx) => (
                      <div
                        key={carrier.id || idx}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={carrier.isActive}
                              onChange={(e) =>
                                handleUpdateCarrier(idx, "isActive", e.target.checked)
                              }
                              className="w-4 h-4 text-violet-600 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={carrier.name}
                              onChange={(e) =>
                                handleUpdateCarrier(idx, "name", e.target.value)
                              }
                              className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded px-2 py-1"
                            />
                            <span className="text-[10px] text-slate-400">
                              (Slug: {carrier.slug})
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteCarrier(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Remove carrier"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Base Rate (₹/kg)
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              value={carrier.baseRatePerKg}
                              onChange={(e) =>
                                handleUpdateCarrier(
                                  idx,
                                  "baseRatePerKg",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold text-slate-800"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Docket / CN (₹)
                            </span>
                            <input
                              type="number"
                              value={carrier.docketCharge}
                              onChange={(e) =>
                                handleUpdateCarrier(
                                  idx,
                                  "docketCharge",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold text-slate-800"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Fuel Surcharge (%)
                            </span>
                            <input
                              type="number"
                              value={carrier.fuelSurchargePercent}
                              onChange={(e) =>
                                handleUpdateCarrier(
                                  idx,
                                  "fuelSurchargePercent",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-bold text-slate-800"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              Est Transit Days
                            </span>
                            <input
                              type="text"
                              value={carrier.estimatedTransitDays}
                              onChange={(e) =>
                                handleUpdateCarrier(idx, "estimatedTransitDays", e.target.value)
                              }
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-semibold text-slate-800"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: State to Zone Mappings */}
              {activeTab === "stateZones" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                        State to Zone Mappings (OM Logistics)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Assign each state/territory to its designated logistics zone.
                      </p>
                    </div>

                    <input
                      type="text"
                      placeholder="Search state..."
                      value={stateSearch}
                      onChange={(e) => setStateSearch(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {filteredStates.map((st) => {
                      const currentZone = stateZoneMap[st] || "UNMAPPED";
                      return (
                        <div
                          key={st}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-800 truncate mr-2" title={st}>
                            {st}
                          </span>

                          <select
                            value={stateZoneMap[st] || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStateZoneMap((prev) => {
                                const copy = { ...prev };
                                if (!val) delete copy[st];
                                else copy[st] = val;
                                return copy;
                              });
                            }}
                            className={`text-xs font-bold rounded px-2 py-1 border ${
                              stateZoneMap[st]
                                ? "bg-white border-violet-300 text-violet-800"
                                : "bg-rose-50 border-rose-300 text-rose-700"
                            }`}
                          >
                            <option value="">Unmapped</option>
                            <option value="East">East</option>
                            <option value="East-Kolkata">East-Kolkata</option>
                            <option value="West">West</option>
                            <option value="North">North</option>
                            <option value="South">South</option>
                            <option value="Central">Central</option>
                            <option value="Guwahati">Guwahati</option>
                            <option value="Northeast">Northeast</option>
                            <option value="7 Sister">7 Sister</option>
                            <option value="Special Zone">Special Zone</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 5: ODA Matrix */}
              {activeTab === "oda" && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                      OM Logistics ODA (ESS) Rate Matrix
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Out of delivery area surcharge in ₹ looked up by weight band and distance band (applied &gt; 40 km).
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3">Weight Band (kg)</th>
                          {ODA_DISTANCE_BANDS.map((b) => (
                            <th key={b.label} className="py-2.5 px-2">
                              {b.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {odaMatrix.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50/80">
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {row.minKg}–{row.maxKg} kg
                            </td>
                            {row.rates.map((rateVal, cIdx) => (
                              <td key={cIdx} className="py-2 px-2">
                                <input
                                  type="number"
                                  value={rateVal}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    setOdaMatrix((prev) => {
                                      const copy = [...prev];
                                      copy[rIdx].rates[cIdx] = val;
                                      return copy;
                                    });
                                  }}
                                  className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: OM WhatsApp Booking */}
              {activeTab === "omWhatsApp" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>OM Logistics WhatsApp Pickup Booking Automation</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        When OM Logistics is assigned, WhatsApp Web automatically opens with the drafted pickup details.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOmWhatsAppConfig(DEFAULT_OM_WHATSAPP_CONFIG)}
                      className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer transition"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-500" />
                      <span>Reset WhatsApp Settings</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: Config Inputs */}
                    <div className="space-y-4">
                      {/* WhatsApp Phone Number */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800">
                          OM Logistics WhatsApp Phone Number
                        </label>
                        <input
                          type="text"
                          value={omWhatsAppConfig.phoneNumber}
                          onChange={(e) =>
                            setOmWhatsAppConfig((prev) => ({
                              ...prev,
                              phoneNumber: e.target.value,
                            }))
                          }
                          placeholder="e.g. 9477070699"
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <p className="text-[11px] text-slate-500">
                          Testing number: <strong className="text-emerald-700">9477070699</strong>. Normalized automatically to international format (+91).
                        </p>
                      </div>

                      {/* Default Warehouse Pickup Address */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800">
                          Default Warehouse Pickup Address & Pin Code
                        </label>
                        <textarea
                          rows={2}
                          value={omWhatsAppConfig.pickupAddress}
                          onChange={(e) =>
                            setOmWhatsAppConfig((prev) => ({
                              ...prev,
                              pickupAddress: e.target.value,
                            }))
                          }
                          placeholder="Warehouse pickup address..."
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <p className="text-[11px] text-slate-500">
                          Replaces <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">{"{{pickupAddress}}"}</code> in the template.
                        </p>
                      </div>

                      {/* Contact Note */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800">
                          Pickup Contact Queries Note
                        </label>
                        <textarea
                          rows={2}
                          value={omWhatsAppConfig.contactNote}
                          onChange={(e) =>
                            setOmWhatsAppConfig((prev) => ({
                              ...prev,
                              contactNote: e.target.value,
                            }))
                          }
                          placeholder="For any pickup related queries..."
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <p className="text-[11px] text-slate-500">
                          Replaces <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">{"{{contactNote}}"}</code> in the template.
                        </p>
                      </div>
                    </div>

                    {/* Right Column: Draft Message Template */}
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-slate-800">
                            WhatsApp Draft Message Template
                          </label>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                            Editable Preset
                          </span>
                        </div>
                        <textarea
                          rows={11}
                          value={omWhatsAppConfig.draftTemplate}
                          onChange={(e) =>
                            setOmWhatsAppConfig((prev) => ({
                              ...prev,
                              draftTemplate: e.target.value,
                            }))
                          }
                          className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                        />

                        {/* Available Placeholders Legend */}
                        <div className="pt-1 border-t border-slate-200 space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-600 block uppercase tracking-wider">
                            Available Template Placeholders:
                          </span>
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {[
                              { tag: "{{pickupDate}}", desc: "Pickup Date (DD.MM.YYYY)" },
                              { tag: "{{pickupAddress}}", desc: "Pickup Pin / Address" },
                              { tag: "{{deliveryAddress}}", desc: "Destination Address" },
                              { tag: "{{totalBoxes}}", desc: "Total Box Count" },
                              { tag: "{{boxDetails}}", desc: "Line-by-line Dimensions" },
                              { tag: "{{contactNote}}", desc: "Contact guidance note" },
                              { tag: "{{orderValue}}", desc: "User-inputted shipment value" },
                            ].map((p) => (
                              <span
                                key={p.tag}
                                title={p.desc}
                                className="bg-white border border-slate-300 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold"
                              >
                                {p.tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <button
            type="button"
            disabled={isResetting || isLoading}
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>{isResetting ? "Resetting..." : "Reset to August 2026 Defaults"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSaving || isLoading}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Saving..." : "Save Presets"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
