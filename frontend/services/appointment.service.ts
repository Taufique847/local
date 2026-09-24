import {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentQuery,
  AppointmentStatus,
  PaginatedAppointmentsResponse,
  AvailableSlotsResponse,
} from '../types/appointment';
import { apiClient } from '../lib/api-client';

export class AppointmentService {
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

    return apiClient.get<PaginatedAppointmentsResponse>(
      `/api/appointments?${searchParams.toString()}`
    );
  }

  /**
   * Every appointment across an inclusive range of local dates, for the week and month
   * views.
   *
   * Unpaginated by design — a month grid needs all of it to place anything — and bounded
   * server-side at 62 days. This endpoint existed from the start and nothing called it,
   * which is why the calendar was day-only.
   */
  public static async getCalendar(from: string, to: string): Promise<Appointment[]> {
    const json = await apiClient.get<{ appointments?: Appointment[] }>(
      `/api/appointments/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    return json.appointments || [];
  }

  /** Feeds the dashboard's today strip, so it degrades to empty rather than erroring. */
  public static async getTodayAppointments(): Promise<Appointment[]> {
    try {
      const json = await apiClient.get<{ appointments?: Appointment[] }>(
        '/api/appointments/today'
      );
      return json.appointments || [];
    } catch {
      return [];
    }
  }

  public static async getAppointmentById(id: string): Promise<Appointment> {
    const json = await apiClient.get<{ appointment: Appointment }>(`/api/appointments/${id}`);
    return json.appointment;
  }

  /**
   * Books an appointment.
   *
   * A 409 here means the slot was taken between the caller reading availability
   * and submitting, or that another booking for this business is mid-flight. Both
   * are worth surfacing verbatim rather than as a generic failure.
   */
  public static async createAppointment(data: CreateAppointmentInput): Promise<Appointment> {
    const json = await apiClient.post<{ appointment: Appointment }>('/api/appointments', data);
    return json.appointment;
  }

  public static async updateAppointment(
    id: string,
    data: UpdateAppointmentInput
  ): Promise<Appointment> {
    const json = await apiClient.put<{ appointment: Appointment }>(
      `/api/appointments/${id}`,
      data
    );
    return json.appointment;
  }

  public static async updateStatus(
    id: string,
    status: AppointmentStatus,
    cancellationReason?: string
  ): Promise<Appointment> {
    const json = await apiClient.patch<{ appointment: Appointment }>(
      `/api/appointments/${id}/status`,
      { status, cancellationReason }
    );
    return json.appointment;
  }

  public static async deleteAppointment(id: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/appointments/${id}`);
  }

  public static async getAvailableSlots(
    serviceId: string,
    date: string
  ): Promise<AvailableSlotsResponse> {
    return apiClient.get<AvailableSlotsResponse>(
      `/api/availability/slots?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`
    );
  }

  public static async checkConflict(
    startAt: string,
    endAt: string,
    excludeAppointmentId?: string
  ): Promise<boolean> {
    const json = await apiClient.post<{ hasConflict: boolean }>(
      '/api/availability/check-conflict',
      { startAt, endAt, excludeAppointmentId }
    );
    return json.hasConflict;
  }
}
