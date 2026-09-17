import {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentQuery,
  AppointmentStatus,
  PaginatedAppointmentsResponse,
  AvailableSlotsResponse,
} from '../types/appointment';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class AppointmentService {
  // Get appointments with filters
  public static async getAppointments(
    params?: AppointmentQuery
  ): Promise<PaginatedAppointmentsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.date) searchParams.set('date', params.date);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.customerId) searchParams.set('customerId', params.customerId);
    if (params?.serviceId) searchParams.set('serviceId', params.serviceId);

    const res = await fetch(`${API_BASE_URL}/api/appointments?${searchParams.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch appointments');
    return json;
  }

  // Get today's appointments
  public static async getTodayAppointments(): Promise<Appointment[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/today`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) return [];
      const json = await res.json();
      return json.appointments || [];
    } catch {
      return [];
    }
  }

  // Get single appointment
  public static async getAppointmentById(id: string): Promise<Appointment> {
    const res = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch appointment');
    return json.appointment;
  }

  // Create appointment
  public static async createAppointment(data: CreateAppointmentInput): Promise<Appointment> {
    const res = await fetch(`${API_BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create appointment');
    return json.appointment;
  }

  // Update appointment
  public static async updateAppointment(
    id: string,
    data: UpdateAppointmentInput
  ): Promise<Appointment> {
    const res = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update appointment');
    return json.appointment;
  }

  // Update appointment status
  public static async updateStatus(
    id: string,
    status: AppointmentStatus,
    cancellationReason?: string
  ): Promise<Appointment> {
    const res = await fetch(`${API_BASE_URL}/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status, cancellationReason }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update status');
    return json.appointment;
  }

  // Delete appointment
  public static async deleteAppointment(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to delete appointment');
  }

  // Get available slots for date & service
  public static async getAvailableSlots(
    serviceId: string,
    date: string
  ): Promise<AvailableSlotsResponse> {
    const res = await fetch(
      `${API_BASE_URL}/api/availability/slots?serviceId=${serviceId}&date=${date}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch available slots');
    return json;
  }

  // Check conflict
  public static async checkConflict(
    startAt: string,
    endAt: string,
    excludeAppointmentId?: string
  ): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/api/availability/check-conflict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ startAt, endAt, excludeAppointmentId }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to check conflict');
    return json.hasConflict;
  }
}
