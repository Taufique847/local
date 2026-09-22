'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerService } from '@/services/customer.service';
import { Customer, CustomerListQuery } from '@/types/customer';
import { CustomerModal } from '@/components/customers/customer-modal';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  MoreVertical, 
  Edit, 
  Eye, 
  Trash2, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wrench,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Customer360Drawer } from '@/components/customers/customer-360-drawer';

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<'all' | 'residential' | 'commercial'>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Customer 360 Drawer State
  const [selected360CustomerId, setSelected360CustomerId] = useState<string | null>(null);
  const [is360Open, setIs360Open] = useState(false);

  // Check if ?action=new was passed in URL
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setSelectedCustomer(null);
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const query: CustomerListQuery = {
        page: currentPage,
        limit,
      };

      if (searchTerm.trim()) {
        query.search = searchTerm.trim();
      }
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }
      if (propertyTypeFilter !== 'all') {
        query.propertyType = propertyTypeFilter;
      }

      const res = await CustomerService.getCustomers(query);
      if (res && res.customers) {
        setCustomers(res.customers);
        setTotalCount(res.total);
        setTotalPages(res.totalPages);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, searchTerm, statusFilter, propertyTypeFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleCreateCustomer = () => {
    setSelectedCustomer(null);
    setIsModalOpen(true);
  };

  const handleEditCustomer = (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomer(cust);
    setIsModalOpen(true);
  };

  const handleCustomerSaved = (savedCustomer: Customer) => {
    fetchCustomers();
  };

  const handleDeleteCustomer = async (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    const custId = cust.id || cust._id || '';
    if (window.confirm(`Are you sure you want to deactivate customer "${cust.firstName} ${cust.lastName}"?`)) {
      try {
        await CustomerService.deleteCustomer(custId);
        fetchCustomers();
      } catch (err) {
        console.error('Failed to delete customer:', err);
      }
    }
  };

  const getStatusBadge = (status: Customer['status']) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium">
            Active
          </Badge>
        );
      case 'inactive':
        return (
          <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50 text-[11px] font-medium">
            Inactive
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardShell
      title="Customers"
      subtitle="HVAC Client Directory & Service Records"
    >
      <div className="space-y-6">
        {/* Top Header Bar with Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Customer CRM
            </h2>
            <p className="text-xs text-slate-500">
              Manage homeowners, commercial accounts, service histories, and contact info.
            </p>
          </div>

          <Button
            onClick={handleCreateCustomer}
            size="sm"
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>

        {/* Filter / Search Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name, phone, email, or city..."
                className="pl-9 text-xs h-9 bg-slate-50/50 border-slate-200 focus:bg-white"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="inactive">Inactive</option>
              </select>

              <select
                value={propertyTypeFilter}
                onChange={(e) => {
                  setPropertyTypeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Types</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
          </div>
        </div>

        {/* Customer Table / List */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
              <span className="text-xs">Loading customer directory...</span>
            </div>
          ) : customers.length === 0 ? (
            /* Empty State */
            <div className="py-16 text-center px-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                No customers found
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm || statusFilter !== 'all' || propertyTypeFilter !== 'all'
                  ? 'No records match your active search filters. Try clearing your search.'
                  : 'Start building your HVAC client list by registering your first customer profile.'}
              </p>
              <div className="mt-4">
                <Button
                  onClick={handleCreateCustomer}
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Customer
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {customers.map((cust) => {
                    const custId = cust.id || cust._id || '';
                    const initials = `${cust.firstName?.[0] || ''}${cust.lastName?.[0] || ''}`.toUpperCase() || 'CU';

                    return (
                      <tr
                        key={custId}
                        onClick={() => {
                          setSelected360CustomerId(custId);
                          setIs360Open(true);
                        }}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center text-xs font-semibold shrink-0 group-hover:bg-slate-200 transition-colors">
                              {initials}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                {cust.firstName} {cust.lastName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                                  <Wrench className="w-2.5 h-2.5 text-blue-600" />
                                  {cust.propertyType === 'commercial' ? 'Carrier 10T RTU' : 'Carrier 4T Split (410A)'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  • {new Date(cust.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-slate-700">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.phone}</span>
                            </div>
                            {cust.email && (
                              <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[150px]">{cust.email}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Address */}
                        <td className="py-3.5 px-4 text-slate-600">
                          {cust.address?.city ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>
                                {cust.address.street ? `${cust.address.street}, ` : ''}
                                {cust.address.city}, {cust.address.state || ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No address</span>
                          )}
                        </td>

                        {/* Property Type */}
                        <td className="py-3.5 px-4">
                          <span className="capitalize text-slate-700 font-medium">
                            {cust.propertyType || 'Residential'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {getStatusBadge(cust.status)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelected360CustomerId(custId);
                                setIs360Open(true);
                              }}
                              className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold flex items-center gap-1"
                              title="Open Customer 360 View"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              <span>360</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/app/estimates?action=new&customerId=${custId}`)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                              title="New Quote"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/app/customers/${custId}`)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleEditCustomer(cust, e)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Edit Customer"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteCustomer(cust, e)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Delete Customer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!loading && customers.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing <span className="font-semibold text-slate-800">{(currentPage - 1) * limit + 1}</span> to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * limit, totalCount)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{totalCount}</span> customers
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-white"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Previous
                </Button>
                <div className="px-2 font-medium text-slate-700">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-white"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        customer={selectedCustomer}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleCustomerSaved}
      />

      {/* Customer 360 Interactive Drawer */}
      <Customer360Drawer
        customerId={selected360CustomerId}
        isOpen={is360Open}
        onClose={() => setIs360Open(false)}
        onCustomerUpdated={fetchCustomers}
      />
    </DashboardShell>
  );
}
