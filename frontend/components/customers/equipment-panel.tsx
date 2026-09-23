'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CustomerService } from '@/services/customer.service';
import {
  Customer,
  CustomerProperty,
  Equipment,
  EquipmentLocation,
  EquipmentType,
} from '@/types/customer';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AlertCircle,
  Archive,
  Check,
  Dog,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

/**
 * Equipment and access details for one customer.
 *
 * Replaces guessing from free text. Before this, the only equipment "record" was an
 * `AgentMemory` row holding a phrase a regex pulled off a transcript, and the
 * appointments list fabricated a unit label — every row displayed
 * "Carrier 4T Split (410A)" regardless of what the customer actually owned.
 *
 * Both halves are editable here because they are what a dispatcher reads out to a
 * technician, and a gate code nobody can correct is worse than no gate code.
 */

const TYPE_LABELS: Record<EquipmentType, string> = {
  furnace: 'Furnace',
  air_conditioner: 'Air conditioner',
  heat_pump: 'Heat pump',
  mini_split: 'Mini split',
  package_unit: 'Package unit',
  boiler: 'Boiler',
  air_handler: 'Air handler',
  water_heater: 'Water heater',
  thermostat: 'Thermostat',
  other: 'Other',
};

const LOCATION_LABELS: Record<EquipmentLocation, string> = {
  attic: 'Attic',
  basement: 'Basement',
  crawl_space: 'Crawl space',
  garage: 'Garage',
  roof: 'Roof',
  closet: 'Closet',
  side_yard: 'Side yard',
  utility_room: 'Utility room',
  exterior: 'Outside',
  other: 'Other',
};

/** Where a value came from, so a guess is not mistaken for a confirmed fact. */
const SOURCE_LABELS: Record<string, string> = {
  ai_call: 'Heard on a call',
  migrated_from_memory: 'Derived from an older note',
};

interface EquipmentPanelProps {
  customerId: string;
  customer: Customer | null;
  onUpdated?: () => void;
}

interface DraftEquipment {
  type: EquipmentType;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  installYear: string;
  filterSize: string;
  location: '' | EquipmentLocation;
  warrantyExpiresAt: string;
  notes: string;
  isPrimary: boolean;
}

const emptyDraft = (): DraftEquipment => ({
  type: 'air_conditioner',
  brand: '',
  modelNumber: '',
  serialNumber: '',
  installYear: '',
  filterSize: '',
  location: '',
  warrantyExpiresAt: '',
  notes: '',
  isPrimary: false,
});

export function EquipmentPanel({ customerId, customer, onUpdated }: EquipmentPanelProps) {
  const toast = useToast();

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftEquipment>(emptyDraft());
  const [busyId, setBusyId] = useState<string | null>(null);

  const [property, setProperty] = useState<CustomerProperty>({});
  const [savingProperty, setSavingProperty] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await CustomerService.getEquipment(customerId, {
        includeInactive: showRetired,
      });
      setEquipment(rows);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load equipment for this customer.'));
    }
  }, [customerId, showRetired]);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Seeded from the profile the drawer already fetched, so opening this tab does not
  // cost another round trip.
  useEffect(() => {
    setProperty(customer?.property ?? {});
  }, [customer]);

  const saveProperty = async () => {
    setSavingProperty(true);
    try {
      await CustomerService.updateCustomer(customerId, { property });
      toast.success('Saved', 'Access details updated.');
      onUpdated?.();
    } catch (err) {
      toast.error('Not saved', toErrorMessage(err, 'Please try again.'));
    } finally {
      setSavingProperty(false);
    }
  };

  const addEquipment = async () => {
    setBusyId('new');
    try {
      await CustomerService.createEquipment(customerId, {
        type: draft.type,
        brand: draft.brand || undefined,
        modelNumber: draft.modelNumber || undefined,
        serialNumber: draft.serialNumber || undefined,
        // Left out entirely rather than sent as NaN when the field is blank.
        installYear: draft.installYear ? Number(draft.installYear) : undefined,
        filterSize: draft.filterSize || undefined,
        location: draft.location || undefined,
        warrantyExpiresAt: draft.warrantyExpiresAt || undefined,
        notes: draft.notes || undefined,
        isPrimary: draft.isPrimary,
      });
      setDraft(emptyDraft());
      setAdding(false);
      await load();
      toast.success('Added', 'Equipment recorded.');
    } catch (err) {
      toast.error('Not added', toErrorMessage(err, 'Check the details and try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const makePrimary = async (unit: Equipment) => {
    setBusyId(unit._id);
    try {
      await CustomerService.updateEquipment(unit._id, { isPrimary: true });
      await load();
    } catch (err) {
      toast.error('Could not update', toErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const retire = async (unit: Equipment) => {
    setBusyId(unit._id);
    try {
      await CustomerService.retireEquipment(unit._id);
      await load();
      toast.success('Retired', 'Kept on file as no longer installed.');
    } catch (err) {
      toast.error('Could not retire', toErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (unit: Equipment) => {
    setBusyId(unit._id);
    try {
      await CustomerService.deleteEquipment(unit._id);
      await load();
      toast.success('Deleted', 'The record was removed.');
    } catch (err) {
      toast.error('Could not delete', toErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const warrantyLabel = (unit: Equipment): { text: string; className: string } | null => {
    if (!unit.warrantyExpiresAt) return null;
    const expires = new Date(unit.warrantyExpiresAt);
    if (isNaN(expires.getTime())) return null;
    return expires.getTime() > Date.now()
      ? {
          text: `Under warranty to ${expires.toLocaleDateString()}`,
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        }
      : {
          text: `Warranty expired ${expires.toLocaleDateString()}`,
          className: 'bg-slate-100 text-slate-600 border-slate-200',
        };
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
            Access & Property
          </h3>
          <Button size="sm" onClick={saveProperty} disabled={savingProperty}>
            {savingProperty ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>

        {/* Stated plainly rather than implied: this is a physical access credential
            and it reaches the assigned technician's phone. */}
        <p className="text-[11px] text-slate-500">
          Shared with the assigned technician in their dispatch text. Never sent to the
          customer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Gate / lockbox code</span>
            <input
              type="text"
              value={property.gateCode ?? ''}
              onChange={(e) => setProperty((p) => ({ ...p, gateCode: e.target.value }))}
              placeholder="e.g. #4821"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Parking</span>
            <input
              type="text"
              value={property.parkingNotes ?? ''}
              onChange={(e) => setProperty((p) => ({ ...p, parkingNotes: e.target.value }))}
              placeholder="e.g. driveway is narrow, park on the street"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-[11px] font-semibold text-slate-600">Access instructions</span>
          <input
            type="text"
            value={property.accessInstructions ?? ''}
            onChange={(e) => setProperty((p) => ({ ...p, accessInstructions: e.target.value }))}
            placeholder="e.g. use the side gate, buzz unit 4B"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
          />
        </label>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Dog className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Pets on site</span>
          </div>

          {/*
            Three states, not a checkbox. "Not asked" is not "no pets", and a
            technician deciding whether to open a gate needs the difference.
          */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: undefined, label: 'Not asked' },
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ].map((option) => (
              <button
                key={String(option.label)}
                type="button"
                onClick={() => setProperty((p) => ({ ...p, hasPets: option.value }))}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  property.hasPets === option.value
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {property.hasPets && (
            <input
              type="text"
              value={property.petNotes ?? ''}
              onChange={(e) => setProperty((p) => ({ ...p, petNotes: e.target.value }))}
              placeholder="e.g. two large dogs in the back yard"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
            />
          )}
        </div>

        <label className="space-y-1 block">
          <span className="text-[11px] font-semibold text-slate-600">Other property notes</span>
          <textarea
            rows={2}
            value={property.propertyNotes ?? ''}
            onChange={(e) => setProperty((p) => ({ ...p, propertyNotes: e.target.value }))}
            placeholder="e.g. two storeys, crawl space access is tight"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
          />
        </label>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-blue-600" />
            Equipment ({equipment.filter((u) => u.active).length})
          </h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
                className="accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500">Show retired</span>
            </label>
            <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
              {adding ? (
                <X className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              {adding ? 'Cancel' : 'Add unit'}
            </Button>
          </div>
        </div>

        {adding && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Type</span>
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, type: e.target.value as EquipmentType }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  {(Object.keys(TYPE_LABELS) as EquipmentType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Where it is</span>
                <select
                  value={draft.location}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, location: e.target.value as DraftEquipment['location'] }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white"
                >
                  <option value="">Not recorded</option>
                  {(Object.keys(LOCATION_LABELS) as EquipmentLocation[]).map((loc) => (
                    <option key={loc} value={loc}>
                      {LOCATION_LABELS[loc]}
                    </option>
                  ))}
                </select>
              </label>

              {(
                [
                  ['brand', 'Brand', 'e.g. Carrier'],
                  ['modelNumber', 'Model number', 'e.g. 25HCB6'],
                  ['serialNumber', 'Serial number', ''],
                  ['filterSize', 'Filter size', 'e.g. 16x25x1'],
                ] as const
              ).map(([field, label, placeholder]) => (
                <label key={field} className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600">{label}</span>
                  <input
                    type="text"
                    value={draft[field]}
                    onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                </label>
              ))}

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Install year</span>
                <input
                  type="number"
                  min={1950}
                  max={new Date().getFullYear() + 1}
                  value={draft.installYear}
                  onChange={(e) => setDraft((d) => ({ ...d, installYear: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Warranty expires</span>
                <input
                  type="date"
                  value={draft.warrantyExpiresAt}
                  onChange={(e) => setDraft((d) => ({ ...d, warrantyExpiresAt: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(e) => setDraft((d) => ({ ...d, isPrimary: e.target.checked }))}
                className="accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-600">
                Main unit — the one the assistant and the dispatch text mention
              </span>
            </label>

            <Button size="sm" onClick={addEquipment} disabled={busyId === 'new'}>
              {busyId === 'new' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Add
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading equipment…
          </div>
        ) : equipment.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            No equipment recorded. Adding it lets the assistant reference the right unit on a
            call and puts it in the technician&apos;s dispatch text.
          </p>
        ) : (
          <ul className="space-y-2">
            {equipment.map((unit) => {
              const busy = busyId === unit._id;
              const warranty = warrantyLabel(unit);
              return (
                <li
                  key={unit._id}
                  className={`rounded-xl border p-3 ${
                    unit.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {[unit.brand, unit.modelNumber].filter(Boolean).join(' ')}{' '}
                        {TYPE_LABELS[unit.type]}
                        {unit.installYear ? ` (${unit.installYear})` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[
                          unit.location ? LOCATION_LABELS[unit.location] : null,
                          unit.filterSize ? `Filter ${unit.filterSize}` : null,
                          unit.serialNumber ? `S/N ${unit.serialNumber}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No further details recorded'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {unit.isPrimary && (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Main unit
                          </span>
                        )}
                        {!unit.active && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            No longer installed
                          </span>
                        )}
                        {warranty && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${warranty.className}`}
                          >
                            {warranty.text}
                          </span>
                        )}
                        {unit.source && SOURCE_LABELS[unit.source] && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            {SOURCE_LABELS[unit.source]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {unit.active && !unit.isPrimary && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => makePrimary(unit)}
                          disabled={busy}
                          title="Make this the unit the assistant mentions"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {unit.active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retire(unit)}
                          disabled={busy}
                          title="No longer installed — keep on file"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(unit)}
                        disabled={busy}
                        title="Delete this record"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
