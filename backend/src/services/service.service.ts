import { Types } from 'mongoose';
import { Service } from '../models/service.model';
import { Business } from '../models/business.model';
import { 
  IService, 
  CreateServiceInput, 
  UpdateServiceInput, 
  ServiceQueryFilter, 
  ServiceStatus, 
  ServiceCategory 
} from '../types/service.types';
import { AppError } from '../types';

export class ServiceService {
  // Helper to normalize category strings safely
  public static normalizeCategory(cat?: string): ServiceCategory {
    if (!cat) return 'Other';
    const lower = cat.toLowerCase().trim();
    if (lower === 'cooling') return 'Cooling';
    if (lower === 'heating') return 'Heating';
    if (lower === 'maintenance') return 'Maintenance';
    if (lower === 'installation') return 'Installation';
    if (lower === 'indoor air quality' || lower === 'indoorairquality' || lower === 'air quality') return 'Indoor Air Quality';
    if (lower === 'ductwork' || lower === 'duct') return 'Ductwork';
    if (lower === 'emergency') return 'Emergency';
    return 'Other';
  }

  // Helper to infer HVAC category from service name
  private static inferCategory(name: string): ServiceCategory {
    const lower = name.toLowerCase();
    if (lower.includes('emergency')) return 'Emergency';
    if (lower.includes('duct')) return 'Ductwork';
    if (lower.includes('air quality') || lower.includes('purifier') || lower.includes('filter')) return 'Indoor Air Quality';
    if (lower.includes('install')) return 'Installation';
    if (lower.includes('tune-up') || lower.includes('maintenance') || lower.includes('inspection')) return 'Maintenance';
    if (lower.includes('heat') || lower.includes('furnace')) return 'Heating';
    if (lower.includes('ac') || lower.includes('cool') || lower.includes('air conditioning')) return 'Cooling';
    return 'Other';
  }

  // Automatic safe migration from M3 embedded business.services
  public static async ensureMigratedFromBusiness(businessId: string | Types.ObjectId): Promise<void> {
    const bId = new Types.ObjectId(businessId.toString());
    const existingCount = await Service.countDocuments({ businessId: bId });
    
    if (existingCount > 0) {
      return; // Already migrated
    }

    const business = await Business.findById(bId);
    if (!business || !business.services || business.services.length === 0) {
      return;
    }

    const servicesToCreate = business.services.map((svc) => {
      const category = ServiceService.inferCategory(svc.name);
      const isEmergency = category === 'Emergency' || svc.name.toLowerCase().includes('emergency');
      
      return {
        businessId: bId,
        name: svc.name,
        description: svc.description || '',
        durationMinutes: 60,
        startingPrice: svc.name.toLowerCase().includes('install') ? 899 : 149,
        category,
        isEmergencyService: isEmergency,
        status: svc.enabled !== false ? 'active' : 'inactive',
      };
    });

    if (servicesToCreate.length > 0) {
      await Service.insertMany(servicesToCreate);
    }
  }

  // Create a new service
  public static async createService(
    businessId: string | Types.ObjectId,
    input: CreateServiceInput
  ): Promise<IService> {
    const bId = new Types.ObjectId(businessId.toString());

    // Check for duplicate active service name within this business
    const existing = await Service.findOne({
      businessId: bId,
      name: { $regex: new RegExp(`^${input.name.trim()}$`, 'i') },
      status: 'active',
    });

    if (existing) {
      throw new AppError(`An active service with the name "${input.name.trim()}" already exists`, 400);
    }

    const service = await Service.create({
      businessId: bId,
      name: input.name.trim(),
      description: input.description?.trim(),
      durationMinutes: input.durationMinutes ? Number(input.durationMinutes) : 60,
      startingPrice: input.startingPrice !== undefined && input.startingPrice !== null ? Number(input.startingPrice) : undefined,
      category: ServiceService.normalizeCategory(input.category),
      isEmergencyService: Boolean(input.isEmergencyService),
      status: input.status || 'active',
    });

    return service;
  }

  // Get paginated services with search and filtering
  public static async getServices(
    businessId: string | Types.ObjectId,
    query: ServiceQueryFilter
  ): Promise<{
    services: IService[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const bId = new Types.ObjectId(businessId.toString());
    await this.ensureMigratedFromBusiness(bId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { businessId: bId };

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
      ];
    }

    // Determine sort
    let sortQuery: Record<string, 1 | -1> = { createdAt: -1 };
    switch (query.sort) {
      case 'oldest':
        sortQuery = { createdAt: 1 };
        break;
      case 'name_asc':
        sortQuery = { name: 1 };
        break;
      case 'name_desc':
        sortQuery = { name: -1 };
        break;
      case 'price_low':
        sortQuery = { startingPrice: 1 };
        break;
      case 'price_high':
        sortQuery = { startingPrice: -1 };
        break;
      case 'newest':
      default:
        sortQuery = { createdAt: -1 };
        break;
    }

    const [services, total] = await Promise.all([
      Service.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .exec(),
      Service.countDocuments(filter),
    ]);

    return {
      services,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // Get single service by ID
  public static async getServiceById(
    businessId: string | Types.ObjectId,
    serviceId: string
  ): Promise<IService | null> {
    if (!Types.ObjectId.isValid(serviceId)) return null;
    const bId = new Types.ObjectId(businessId.toString());

    return await Service.findOne({
      _id: serviceId,
      businessId: bId,
    });
  }

  // Update an existing service
  public static async updateService(
    businessId: string | Types.ObjectId,
    serviceId: string,
    input: UpdateServiceInput
  ): Promise<IService | null> {
    if (!Types.ObjectId.isValid(serviceId)) return null;
    const bId = new Types.ObjectId(businessId.toString());

    // If updating name, check for duplicate
    if (input.name && input.name.trim()) {
      const duplicate = await Service.findOne({
        _id: { $ne: serviceId },
        businessId: bId,
        name: { $regex: new RegExp(`^${input.name.trim()}$`, 'i') },
        status: 'active',
      });

      if (duplicate) {
        throw new AppError(`An active service with the name "${input.name.trim()}" already exists`, 400);
      }
    }

    const updateData: Record<string, any> = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description.trim();
    if (input.durationMinutes !== undefined) updateData.durationMinutes = Number(input.durationMinutes);
    if (input.startingPrice !== undefined) {
      updateData.startingPrice = input.startingPrice !== null ? Number(input.startingPrice) : undefined;
    }
    if (input.category !== undefined) updateData.category = ServiceService.normalizeCategory(input.category);
    if (input.isEmergencyService !== undefined) updateData.isEmergencyService = Boolean(input.isEmergencyService);
    if (input.status !== undefined) updateData.status = input.status;

    return await Service.findOneAndUpdate(
      { _id: serviceId, businessId: bId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  // Update status (active/inactive)
  public static async updateServiceStatus(
    businessId: string | Types.ObjectId,
    serviceId: string,
    status: ServiceStatus
  ): Promise<IService | null> {
    if (!Types.ObjectId.isValid(serviceId)) return null;
    const bId = new Types.ObjectId(businessId.toString());

    if (!['active', 'inactive'].includes(status)) {
      throw new Error('Invalid status. Allowed: "active", "inactive"');
    }

    return await Service.findOneAndUpdate(
      { _id: serviceId, businessId: bId },
      { $set: { status } },
      { new: true, runValidators: true }
    );
  }

  // Soft archive service (deactivate)
  public static async archiveService(
    businessId: string | Types.ObjectId,
    serviceId: string
  ): Promise<IService | null> {
    return await this.updateServiceStatus(businessId, serviceId, 'inactive');
  }

  // Get statistics
  public static async getServiceStats(
    businessId: string | Types.ObjectId
  ): Promise<{
    total: number;
    active: number;
    inactive: number;
    emergencyServices: number;
    byCategory: Record<string, number>;
  }> {
    const bId = new Types.ObjectId(businessId.toString());
    await this.ensureMigratedFromBusiness(bId);

    const [allServices, total] = await Promise.all([
      Service.find({ businessId: bId }),
      Service.countDocuments({ businessId: bId }),
    ]);

    let active = 0;
    let inactive = 0;
    let emergencyServices = 0;
    const byCategory: Record<string, number> = {};

    for (const s of allServices) {
      if (s.status === 'active') active++;
      else inactive++;

      if (s.isEmergencyService) emergencyServices++;

      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    }

    return {
      total,
      active,
      inactive,
      emergencyServices,
      byCategory,
    };
  }
}
