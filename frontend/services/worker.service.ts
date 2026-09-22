import { apiClient } from '../lib/api-client';

/** Field technician PWA calls. */
export class WorkerService {
  public static async getTechnicians(): Promise<any[]> {
    const json = await apiClient.get<{ technicians?: any[] }>('/api/worker/technicians');
    return json.technicians || [];
  }

  public static async getTodayJobs(technicianId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (technicianId) params.append('technicianId', technicianId);

    const json = await apiClient.get<{ jobs?: any[] }>(
      `/api/worker/jobs/today?${params.toString()}`
    );
    return json.jobs || [];
  }

  public static async updateJobStatus(
    appointmentId: string,
    status: string,
    locationData?: { latitude?: number; longitude?: number; address?: string }
  ): Promise<any> {
    const json = await apiClient.patch<{ appointment: any }>(
      `/api/worker/jobs/${appointmentId}/status`,
      { status, ...locationData }
    );
    return json.appointment;
  }

  public static async updateJobExecution(
    appointmentId: string,
    data: {
      checklist?: Array<{ item: string; completed: boolean }>;
      photos?: Array<{ url: string; caption?: string; phase: 'before' | 'after' }>;
      partsUsed?: Array<{ partName: string; quantity: number; unitCost: number; totalCost: number }>;
      internalNotes?: string;
    }
  ): Promise<any> {
    const json = await apiClient.patch<{ appointment: any }>(
      `/api/worker/jobs/${appointmentId}/execution`,
      data
    );
    return json.appointment;
  }

  public static async completeJobAndGenerateInvoice(
    appointmentId: string,
    data: {
      diagnosticFeeCredit?: number;
      additionalLaborHours?: number;
      laborRate?: number;
      notes?: string;
    }
  ): Promise<{ appointment: any; invoice: any }> {
    return apiClient.post<{ appointment: any; invoice: any }>(
      `/api/worker/jobs/${appointmentId}/complete`,
      data
    );
  }
}
