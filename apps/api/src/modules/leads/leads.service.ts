import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadPriority, LeadStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadSettingsDto } from './dto/update-lead-settings.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async createFromLanding(dto: CreateLeadDto) {
    const settings = await this.ensureWorkflowSettings();
    const assignedTo = settings?.autoAssignUserId
      ? {
          connect: { id: settings.autoAssignUserId },
        }
      : undefined;

    const lead = await this.prisma.lead.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        company: dto.company,
        phone: dto.phone,
        message: dto.message,
        priority: dto.priority ?? LeadPriority.MEDIUM,
        status: LeadStatus.NEW,
        routingLabel: settings?.routingHeadline ?? 'Website',
        assignedTo,
      },
      include: {
        assignedTo: true,
      },
    });

    await this.prisma.leadUpdate.create({
      data: {
        leadId: lead.id,
        status: lead.status,
        note: 'Neue Anfrage über Landingpage',
      },
    });

    return lead;
  }

  async listLeads(limit = 25) {
    return this.prisma.lead.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { assignedTo: true },
    });
  }

  async updateLead(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Lead nicht gefunden');
    }

    const data: Prisma.LeadUpdateInput = {};

    if (dto.status) {
      data.status = dto.status;
      data.processedAt =
        dto.status === LeadStatus.NEW
          ? null
          : (existing.processedAt ?? new Date());

      data.archivedAt = dto.status === LeadStatus.ARCHIVED ? new Date() : null;
    }

    if (dto.priority) {
      data.priority = dto.priority;
    }

    if (dto.routingLabel) {
      data.routingLabel = dto.routingLabel;
    }

    if (dto.assignedToId) {
      await this.ensureUser(dto.assignedToId);
    }

    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: { assignedTo: true },
    });

    if (dto.status || dto.note) {
      await this.prisma.leadUpdate.create({
        data: {
          leadId: updated.id,
          userId: actor?.sub ?? null,
          status: dto.status ?? updated.status,
          note: dto.note,
        },
      });
    }

    return updated;
  }

  async getTimeline(leadId: string) {
    await this.ensureLeadExists(leadId);

    return this.prisma.leadUpdate.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async ensureWorkflowSettings(defaults?: {
    notifyEmail?: string;
    autoAssignUserId?: string;
  }) {
    let settings = await this.prisma.leadWorkflowSetting.findFirst({
      include: { autoAssignUser: true },
    });

    if (!settings) {
      settings = await this.prisma.leadWorkflowSetting.create({
        data: {
          notifyEmail: defaults?.notifyEmail,
          routingHeadline: 'Kontaktaufnahme',
          routingDescription: 'Neue Leads landen direkt im Dashboard.',
          autoAssignUserId: defaults?.autoAssignUserId,
        },
        include: { autoAssignUser: true },
      });
    }

    return settings;
  }

  async getWorkflowSettings() {
    return this.ensureWorkflowSettings();
  }

  async updateWorkflowSettings(dto: UpdateLeadSettingsDto) {
    if (dto.autoAssignUserId) {
      await this.ensureUser(dto.autoAssignUserId);
    }

    const existing = await this.prisma.leadWorkflowSetting.findFirst();
    if (!existing) {
      return this.ensureWorkflowSettings({
        notifyEmail: dto.notifyEmail,
        autoAssignUserId: dto.autoAssignUserId ?? undefined,
      });
    }

    const data: Prisma.LeadWorkflowSettingUpdateInput = {
      notifyEmail: dto.notifyEmail ?? existing.notifyEmail,
      routingHeadline: dto.routingHeadline ?? existing.routingHeadline,
      routingDescription: dto.routingDescription ?? existing.routingDescription,
      autoResponderEnabled:
        dto.autoResponderEnabled ?? existing.autoResponderEnabled,
      autoResponderMessage:
        dto.autoResponderMessage ?? existing.autoResponderMessage,
    };

    if (dto.autoAssignUserId !== undefined) {
      data.autoAssignUser = dto.autoAssignUserId
        ? { connect: { id: dto.autoAssignUserId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.leadWorkflowSetting.update({
      where: { id: existing.id },
      data,
      include: { autoAssignUser: true },
    });

    return updated;
  }

  private async ensureLeadExists(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Lead nicht gefunden');
    }
    return lead;
  }

  private async ensureUser(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User für Assignment nicht gefunden');
    }
    return user;
  }
}
