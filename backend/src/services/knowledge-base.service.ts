import { Types } from 'mongoose';
import { KnowledgeItem, IKnowledgeItem, KnowledgeCategory } from '../models/knowledge-item.model';
import { AppError } from '../types';

export interface CreateKnowledgeInput {
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags?: string[];
  priority?: number;
  isPublished?: boolean;
}

export interface UpdateKnowledgeInput {
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  tags?: string[];
  priority?: number;
  isPublished?: boolean;
}

export class KnowledgeBaseService {
  /**
   * Seeds starter knowledge items when a business has none.
   *
   * The content below is HVAC-specific — warranty terms, refrigerant, furnace
   * behaviour — and it feeds the voice assistant's answers. It was previously
   * seeded for every business regardless of trade, so a plumber's assistant
   * could quote HVAC warranty terms to a caller as though they were the
   * plumber's own.
   *
   * Only HVAC businesses get it. Others start empty, which is honest: an empty
   * knowledge base makes the assistant say it does not know, rather than confidently
   * state another trade's policy.
   */
  public static async seedDefaultHVACKnowledge(businessId: Types.ObjectId | string): Promise<void> {
    const count = await KnowledgeItem.countDocuments({ businessId });
    if (count > 0) return;

    const { Business } = await import('../models/business.model');
    const business = await Business.findById(businessId).select('businessType').lean();

    if (business && business.businessType !== 'HVAC') return;

    const defaults = [
      {
        businessId,
        category: 'pricing_guide' as KnowledgeCategory,
        title: 'Standard Diagnostic & Trip Fee',
        content:
          'We charge an $89 diagnostic fee which includes technician travel and comprehensive system inspection. If the customer approves the repair work, this fee is applied towards the total invoice.',
        tags: ['diagnostic', 'fee', 'pricing', 'trip charge', 'cost'],
        priority: 10,
      },
      {
        businessId,
        category: 'policy' as KnowledgeCategory,
        title: 'Repair & Installation Warranty Policy',
        content:
          'All residential HVAC repairs include a 1-year parts and labor warranty. New equipment replacements and full system installations include a 10-year manufacturer equipment warranty and 2-year workmanship warranty.',
        tags: ['warranty', 'guarantee', 'parts', 'labor'],
        priority: 8,
      },
      {
        businessId,
        category: 'policy' as KnowledgeCategory,
        title: 'Appointment Cancellation & Reschedule Policy',
        content:
          'Customers may reschedule or cancel their service appointment free of charge up to 2 hours before the scheduled technician arrival window. No cancellation penalties apply for weather emergencies.',
        tags: ['cancellation', 'reschedule', 'policy', 'late fee'],
        priority: 7,
      },
      {
        businessId,
        category: 'service_area' as KnowledgeCategory,
        title: 'Service Area Coverage',
        content:
          'We provide complete heating and cooling service across the greater metropolitan area within a 35-mile radius, including all surrounding residential suburbs and commercial districts.',
        tags: ['service area', 'coverage', 'location', 'cities', 'zip codes'],
        priority: 9,
      },
      {
        businessId,
        category: 'faq' as KnowledgeCategory,
        title: 'Emergency 24/7 HVAC Service',
        content:
          'We provide 24/7 emergency dispatch for no-heat situations during sub-freezing winter temperatures, complete AC failures in extreme heat advisories, active refrigerant leaks, and electrical burning odors from air handlers.',
        tags: ['emergency', '24/7', 'after hours', 'weekend', 'urgent'],
        priority: 10,
      },
    ];

    await KnowledgeItem.insertMany(defaults);
  }

  /**
   * Creates a new knowledge item
   */
  public static async createItem(
    businessId: Types.ObjectId | string,
    input: CreateKnowledgeInput,
    createdBy: string = 'owner'
  ): Promise<IKnowledgeItem> {
    return KnowledgeItem.create({
      businessId,
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags || [],
      priority: input.priority || 0,
      isPublished: input.isPublished ?? true,
      createdBy,
    });
  }

  /**
   * Searches knowledge base for RAG during AI receptionist conversations
   */
  public static async searchKnowledgeBase(
    businessId: Types.ObjectId | string,
    query: string,
    category?: KnowledgeCategory
  ): Promise<Array<{ title: string; content: string; category: string; score: number }>> {
    await this.seedDefaultHVACKnowledge(businessId);

    const trimmed = query.trim();
    if (!trimmed) return [];

    const baseFilter: any = { businessId, isPublished: true };
    if (category) baseFilter.category = category;

    try {
      // 1. Full-text search
      const textMatches = await KnowledgeItem.find(
        { ...baseFilter, $text: { $search: trimmed } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' }, priority: -1 })
        .limit(5)
        .lean();

      if (textMatches.length > 0) {
        return textMatches.map((m: any) => ({
          title: m.title,
          content: m.content,
          category: m.category,
          score: m.score || 1,
        }));
      }
    } catch {
      // Fallback to regex if text index is not yet built
    }

    // 2. Keyword regex search fallback
    const terms = trimmed.split(/\s+/).filter(Boolean);
    const regexList = terms.map((t) => new RegExp(t, 'i'));

    const regexMatches = await KnowledgeItem.find({
      ...baseFilter,
      $or: [{ title: { $in: regexList } }, { content: { $in: regexList } }, { tags: { $in: regexList } }],
    })
      .sort({ priority: -1 })
      .limit(5)
      .lean();

    return regexMatches.map((m: any) => ({
      title: m.title,
      content: m.content,
      category: m.category,
      score: 0.8,
    }));
  }

  /**
   * List paginated knowledge items for dashboard
   */
  public static async getItems(
    businessId: Types.ObjectId | string,
    filter: {
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ items: IKnowledgeItem[]; total: number; page: number; totalPages: number }> {
    await this.seedDefaultHVACKnowledge(businessId);

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const query: any = { businessId };
    if (filter.category && filter.category !== 'all') {
      query.category = filter.category;
    }

    if (filter.search && filter.search.trim()) {
      const regex = new RegExp(filter.search.trim(), 'i');
      query.$or = [{ title: regex }, { content: regex }, { tags: regex }];
    }

    const [items, total] = await Promise.all([
      KnowledgeItem.find(query).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(limit),
      KnowledgeItem.countDocuments(query),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public static async getItemById(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<IKnowledgeItem> {
    const item = await KnowledgeItem.findOne({ _id: id, businessId });
    if (!item) throw new AppError('Knowledge item not found', 404);
    return item;
  }

  public static async updateItem(
    businessId: Types.ObjectId | string,
    id: string,
    input: UpdateKnowledgeInput
  ): Promise<IKnowledgeItem> {
    const item = await KnowledgeItem.findOneAndUpdate(
      { _id: id, businessId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Knowledge item not found', 404);
    return item;
  }

  public static async deleteItem(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<boolean> {
    const res = await KnowledgeItem.deleteOne({ _id: id, businessId });
    if (res.deletedCount === 0) throw new AppError('Knowledge item not found', 404);
    return true;
  }
}
