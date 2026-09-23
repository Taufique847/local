'use client';

import React, { useState, useEffect } from 'react';
import { Customer, CustomerStatus, CreateCustomerDto, UpdateCustomerDto } from '@/types/customer';
import { CustomerService } from '@/services/customer.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2, User, Phone, Mail, MapPin, Building, FileText, AlertCircle } from 'lucide-react';

interface CustomerModalProps {
  isOpen: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

export function CustomerModal({ isOpen, customer, onClose, onSaved }: CustomerModalProps) {
  const isEditing = Boolean(customer);

  const [formData, setFormData] = useState<CreateCustomerDto>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    status: 'active',
    address: {
      street: '',
      city: '',
      state: '',
      zip: '',
    },
    // Undefined, not 'residential'. A new customer whose type nobody has asked about
    // must not be recorded as residential by default.
    propertyType: undefined as 'residential' | 'commercial' | undefined,
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form if editing
  useEffect(() => {
    if (customer) {
      setFormData({
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        phone: customer.phone || '',
        email: customer.email || '',
        status: customer.status || 'active',
        address: {
          street: customer.address?.street || '',
          city: customer.address?.city || '',
          state: customer.address?.state || '',
          zip: customer.address?.zip || '',
        },
        // NOT defaulted to 'residential'. Doing that silently asserted a property
        // type for every customer whose type had never been recorded, the moment
        // anyone opened this form to change an unrelated field.
        propertyType: customer.propertyType,
        notes: customer.notes || '',
      });
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        status: 'active',
        address: {
          street: '',
          city: '',
          state: '',
          zip: '',
        },
        propertyType: undefined,
        notes: '',
      });
    }
    setError(null);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client validation
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return;
    }

    setLoading(true);
    try {
      if (isEditing && customer) {
        const custId = customer.id || customer._id || '';
        const saved = await CustomerService.updateCustomer(custId, formData);
        onSaved(saved);
        onClose();
      } else {
        const saved = await CustomerService.createCustomer(formData);
        onSaved(saved);
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Customer' : 'Add New Customer'}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing
                ? 'Update customer details and contact preferences'
                : 'Create a customer record in your HVAC directory'}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                First Name *
              </label>
              <div className="relative">
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="e.g. Michael"
                  required
                  className="pl-8 text-xs h-9 bg-white"
                />
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Last Name *
              </label>
              <div className="relative">
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="e.g. Scott"
                  required
                  className="pl-8 text-xs h-9 bg-white"
                />
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>

          {/* Contact Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Phone Number *
              </label>
              <div className="relative">
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 234-5678"
                  required
                  className="pl-8 text-xs h-9 bg-white"
                />
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="michael@scranton.com"
                  className="pl-8 text-xs h-9 bg-white"
                />
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>

          {/* Status & Property Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as CustomerStatus })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="active">Active Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Property Type
              </label>
              {/*
                Three options, because "not recorded" is a real state. This control used
                to offer only two and pre-select Residential, so editing a customer's
                phone number silently asserted their property type — and the list, the
                lead page and the drawer all then displayed it as fact.
              */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    [undefined, 'Not recorded'],
                    ['residential', 'Residential'],
                    ['commercial', 'Commercial'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setFormData({ ...formData, propertyType: value })}
                    className={`h-9 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      formData.propertyType === value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {value && <Building className="w-3 h-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Service Address */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block font-semibold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Service Address
            </label>
            <div>
              <Input
                value={formData.address?.street}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address!, street: e.target.value },
                  })
                }
                placeholder="Street Address (e.g. 1725 Slough Ave)"
                className="text-xs h-9 bg-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Input
                value={formData.address?.city}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address!, city: e.target.value },
                  })
                }
                placeholder="City (Scranton)"
                className="text-xs h-9 bg-white"
              />
              <Input
                value={formData.address?.state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address!, state: e.target.value.toUpperCase() },
                  })
                }
                placeholder="State (PA)"
                maxLength={2}
                className="text-xs h-9 bg-white"
              />
              <Input
                value={formData.address?.zip}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address!, zip: e.target.value },
                  })
                }
                placeholder="ZIP Code (18503)"
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>

          {/* Internal Notes */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <label className="block font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Service Notes & HVAC Specs
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Carrier 3-ton heat pump in attic, gate code #4412, prefers morning appointments."
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              {loading && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
