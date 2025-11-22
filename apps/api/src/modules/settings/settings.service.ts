import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SystemSetting } from '@prisma/client';

import {
  SmtpCredentials,
  SmtpEncryption,
  SmtpSettingsResponse,
} from '../../common/interfaces/smtp-settings.interface';
import {
  ImapCredentials,
  ImapSettingsResponse,
  ImapEncryption,
} from '../../common/interfaces/imap-settings.interface';
import { WorkspaceSettings } from '../../common/interfaces/workspace-settings.interface';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateImapSettingsDto } from './dto/update-imap-settings.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';

const SMTP_SETTING_KEY = 'smtp-settings';
const IMAP_SETTING_KEY = 'imap-settings';
const IMAP_SYNC_STATE_KEY = 'imap-sync-state';
const WORKSPACE_SETTING_KEY = 'workspace-settings';
const API_SETTING_KEY = 'api-settings';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSmtpSettings(): Promise<SmtpSettingsResponse | null> {
    const record = await this.findSettingRecord(SMTP_SETTING_KEY);
    if (!record) {
      return null;
    }

    const settings = this.parseSmtpCredentials(record.value);
    if (!settings) {
      return null;
    }

    return this.mapToResponse(settings, record.updatedAt);
  }

  async getSmtpCredentials(): Promise<SmtpCredentials | null> {
    const record = await this.findSettingRecord(SMTP_SETTING_KEY);
    if (!record) {
      return null;
    }
    return this.parseSmtpCredentials(record.value);
  }

  async getImapSettings(): Promise<ImapSettingsResponse | null> {
    const record = await this.findSettingRecord(IMAP_SETTING_KEY);
    if (!record) {
      return null;
    }
    const credentials = this.parseImapCredentials(record.value);
    if (!credentials) {
      return null;
    }
    return this.mapImapToResponse(credentials, record.updatedAt);
  }

  async getImapCredentials(): Promise<ImapCredentials | null> {
    const record = await this.findSettingRecord(IMAP_SETTING_KEY);
    if (!record) {
      return null;
    }
    return this.parseImapCredentials(record.value);
  }

  async updateSmtpSettings(
    dto: UpdateSmtpSettingsDto,
  ): Promise<SmtpSettingsResponse> {
    const existing = await this.getSmtpCredentials();

    const nextPassword = dto.password?.trim()
      ? dto.password.trim()
      : existing?.password;

    if (!nextPassword) {
      throw new BadRequestException(
        'Bitte gib ein SMTP-Passwort ein oder hinterlege es erneut.',
      );
    }

    const data: SmtpCredentials = {
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username.trim(),
      password: nextPassword,
      fromName: dto.fromName?.trim() || null,
      fromEmail: dto.fromEmail?.trim() || null,
      encryption: dto.encryption ?? existing?.encryption ?? 'tls',
    };

    const saved = await this.saveSetting(SMTP_SETTING_KEY, data);

    return this.mapToResponse(data, saved.updatedAt);
  }

  async updateImapSettings(
    dto: UpdateImapSettingsDto,
  ): Promise<ImapSettingsResponse> {
    const existing = await this.getImapCredentials();
    const nextPassword = dto.password?.trim()
      ? dto.password.trim()
      : existing?.password;

    if (!nextPassword) {
      throw new BadRequestException(
        'Bitte gib ein IMAP-Passwort ein oder hinterlege es erneut.',
      );
    }

    const data: ImapCredentials = {
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username.trim(),
      password: nextPassword,
      encryption: dto.encryption ?? existing?.encryption ?? 'ssl',
      mailbox: dto.mailbox?.trim() || existing?.mailbox || 'INBOX',
      sinceDays:
        typeof dto.sinceDays === 'number'
          ? dto.sinceDays
          : existing?.sinceDays ?? 7,
    };

    const saved = await this.saveSetting(IMAP_SETTING_KEY, data);
    return this.mapImapToResponse(data, saved.updatedAt);
  }

  async getWorkspaceSettings(): Promise<WorkspaceSettings | null> {
    const record = await this.findSettingRecord(WORKSPACE_SETTING_KEY);
    if (!record) {
      return null;
    }
    const parsed = this.parseWorkspaceSettings(record.value);
    if (!parsed) {
      return null;
    }
    return { ...parsed, updatedAt: record.updatedAt.toISOString() };
  }

  async updateWorkspaceSettings(
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceSettings> {
    const data: WorkspaceSettings = {
      companyName: dto.companyName?.trim() || null,
      legalName: dto.legalName?.trim() || null,
      industry: dto.industry?.trim() || null,
      tagline: dto.tagline?.trim() || null,
      mission: dto.mission?.trim() || null,
      vision: dto.vision?.trim() || null,
      description: dto.description?.trim() || null,
      foundedYear: typeof dto.foundedYear === 'number' ? dto.foundedYear : null,
      teamSize: typeof dto.teamSize === 'number' ? dto.teamSize : null,
      supportEmail: dto.supportEmail?.trim() || null,
      supportPhone: dto.supportPhone?.trim() || null,
      timezone: dto.timezone?.trim() || null,
      currency: dto.currency?.trim() || null,
      vatNumber: dto.vatNumber?.trim() || null,
      registerNumber: dto.registerNumber?.trim() || null,
      address: {
        street: dto.street?.trim() || null,
        postalCode: dto.postalCode?.trim() || null,
        city: dto.city?.trim() || null,
        country: dto.country?.trim() || null,
      },
      branding: {
        primaryColor: dto.primaryColor?.trim() || null,
        secondaryColor: dto.secondaryColor?.trim() || null,
        accentColor: dto.accentColor?.trim() || null,
        logoUrl: dto.logoUrl?.trim() || null,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
      },
      social: {
        website: dto.website?.trim() || null,
        linkedin: dto.linkedin?.trim() || null,
        twitter: dto.twitter?.trim() || null,
        facebook: dto.facebook?.trim() || null,
        instagram: dto.instagram?.trim() || null,
        youtube: dto.youtube?.trim() || null,
      },
    };

    const saved = await this.saveSetting(WORKSPACE_SETTING_KEY, data);
    return { ...data, updatedAt: saved.updatedAt.toISOString() };
  }

  async getApiSettings(): Promise<{
    embedUrl: string | null;
    apiToken: string | null;
    hasServiceAccount: boolean;
    updatedAt?: string;
  } | null> {
    const record = await this.findSettingRecord(API_SETTING_KEY);
    if (!record) {
      return null;
    }
    const payload = this.parseApiSettings(record.value);
    if (!payload) {
      return null;
    }
    return {
      embedUrl: payload.embedUrl,
      apiToken: payload.apiToken,
      hasServiceAccount: payload.serviceAccountJson ? true : false,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateApiSettings(
    dto: UpdateApiSettingsDto,
  ): Promise<{
    embedUrl: string | null;
    apiToken: string | null;
    hasServiceAccount: boolean;
    updatedAt: string;
  }> {
    const existingRecord = await this.findSettingRecord(API_SETTING_KEY);
    const existingParsed = existingRecord
      ? this.parseApiSettings(existingRecord.value)
      : null;

    const nextToken =
      dto.apiToken?.trim() ||
      existingParsed?.apiToken ||
      null;

    const embedUrl = dto.embedUrl?.trim() || existingParsed?.embedUrl || null;
    const serviceAccountJson =
      dto.serviceAccountJson?.trim() ||
      existingParsed?.serviceAccountJson ||
      null;

    const data = {
      embedUrl,
      apiToken: nextToken,
      serviceAccountJson,
    };

    const saved = await this.saveSetting(API_SETTING_KEY, data);
    return {
      embedUrl,
      apiToken: nextToken,
      hasServiceAccount: Boolean(serviceAccountJson),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async getImapSyncState(): Promise<{ lastUid?: number } | null> {
    const record = await this.findSettingRecord(IMAP_SYNC_STATE_KEY);
    if (!record || !record.value || typeof record.value !== 'object') {
      return null;
    }
    const payload = record.value as Record<string, unknown>;
    const lastUid = Number(payload.lastUid);
    return Number.isFinite(lastUid) ? { lastUid } : { lastUid: undefined };
  }

  async saveImapSyncState(state: { lastUid?: number }) {
    await this.saveSetting(IMAP_SYNC_STATE_KEY, state);
  }

  private async findSettingRecord(key: string): Promise<SystemSetting | null> {
    return this.prisma.systemSetting.findUnique({
      where: { key },
    });
  }

  private async saveSetting(
    key: string,
    value: unknown,
  ): Promise<SystemSetting> {
    const jsonValue = this.toJsonInput(value);
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: jsonValue },
      update: { value: jsonValue },
    });
  }

  private toJsonInput(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private parseSmtpCredentials(
    value: Prisma.JsonValue,
  ): SmtpCredentials | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;

    if (
      typeof payload.host !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.password !== 'string'
    ) {
      return null;
    }

    const port =
      typeof payload.port === 'number'
        ? payload.port
        : Number(payload.port ?? 587);

    const encryption = this.normalizeEncryption(
      (payload.encryption as string) ?? 'tls',
    );

    return {
      host: payload.host,
      username: payload.username,
      password: payload.password,
      port: Number.isNaN(port) ? 587 : port,
      fromName: typeof payload.fromName === 'string' ? payload.fromName : null,
      fromEmail:
        typeof payload.fromEmail === 'string' ? payload.fromEmail : null,
      encryption,
    };
  }

  private normalizeEncryption(value: string): SmtpEncryption {
    const normalized = value?.toLowerCase();
    if (normalized === 'ssl' || normalized === 'tls') {
      return normalized;
    }
    return 'tls';
  }

  private parseImapCredentials(
    value: Prisma.JsonValue,
  ): ImapCredentials | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;

    if (
      typeof payload.host !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.password !== 'string'
    ) {
      return null;
    }

    const port =
      typeof payload.port === 'number'
        ? payload.port
        : Number(payload.port ?? 993);

    return {
      host: payload.host,
      username: payload.username,
      password: payload.password,
      port: Number.isNaN(port) ? 993 : port,
      mailbox:
        typeof payload.mailbox === 'string' && payload.mailbox.trim()
          ? payload.mailbox
          : 'INBOX',
      encryption: this.normalizeImapEncryption(
        (payload.encryption as string) ?? 'ssl',
      ),
      sinceDays:
        typeof payload.sinceDays === 'number' &&
        Number.isFinite(payload.sinceDays)
          ? payload.sinceDays
          : undefined,
    };
  }

  private normalizeImapEncryption(value: string): ImapEncryption {
    const normalized = value?.toLowerCase();
    if (normalized === 'ssl' || normalized === 'tls') {
      return normalized;
    }
    return 'ssl';
  }

  private mapImapToResponse(
    data: ImapCredentials,
    updatedAt: Date,
  ): ImapSettingsResponse {
    return {
      host: data.host,
      port: data.port,
      username: data.username,
      mailbox: data.mailbox,
      encryption: data.encryption,
      hasPassword: Boolean(data.password),
      sinceDays: data.sinceDays,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private mapToResponse(
    data: SmtpCredentials,
    updatedAt: Date,
  ): SmtpSettingsResponse {
    return {
      host: data.host,
      port: data.port,
      username: data.username,
      fromName: data.fromName ?? null,
      fromEmail: data.fromEmail ?? null,
      encryption: data.encryption,
      hasPassword: Boolean(data.password),
      updatedAt: updatedAt.toISOString(),
    };
  }

  private parseWorkspaceSettings(
    value: Prisma.JsonValue,
  ): WorkspaceSettings | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const payload = value as Record<string, unknown>;

    const numberOrNull = (maybeNumber: unknown): number | null => {
      if (typeof maybeNumber === 'number') {
        return maybeNumber;
      }
      const parsed = Number(maybeNumber);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const str = (maybe: unknown): string | null =>
      typeof maybe === 'string' ? maybe : null;

    return {
      companyName: str(payload.companyName),
      legalName: str(payload.legalName),
      industry: str(payload.industry),
      tagline: str(payload.tagline),
      mission: str(payload.mission),
      vision: str(payload.vision),
      description: str(payload.description),
      foundedYear: numberOrNull(payload.foundedYear),
      teamSize: numberOrNull(payload.teamSize),
      supportEmail: str(payload.supportEmail),
      supportPhone: str(payload.supportPhone),
      timezone: str(payload.timezone),
      currency: str(payload.currency),
      vatNumber: str(payload.vatNumber),
      registerNumber: str(payload.registerNumber),
      address:
        typeof payload.address === 'object' && payload.address !== null
          ? {
              street: str((payload.address as Record<string, unknown>).street),
              postalCode: str(
                (payload.address as Record<string, unknown>).postalCode,
              ),
              city: str((payload.address as Record<string, unknown>).city),
              country: str(
                (payload.address as Record<string, unknown>).country,
              ),
            }
          : undefined,
      branding:
        typeof payload.branding === 'object' && payload.branding !== null
          ? {
              primaryColor: str(
                (payload.branding as Record<string, unknown>).primaryColor,
              ),
              secondaryColor: str(
                (payload.branding as Record<string, unknown>).secondaryColor,
              ),
              accentColor: str(
                (payload.branding as Record<string, unknown>).accentColor,
              ),
              logoUrl: str(
                (payload.branding as Record<string, unknown>).logoUrl,
              ),
              coverImageUrl: str(
                (payload.branding as Record<string, unknown>).coverImageUrl,
              ),
            }
          : undefined,
      social:
        typeof payload.social === 'object' && payload.social !== null
          ? {
              website: str((payload.social as Record<string, unknown>).website),
              linkedin: str(
                (payload.social as Record<string, unknown>).linkedin,
              ),
              twitter: str((payload.social as Record<string, unknown>).twitter),
              facebook: str(
                (payload.social as Record<string, unknown>).facebook,
              ),
              instagram: str(
                (payload.social as Record<string, unknown>).instagram,
              ),
              youtube: str((payload.social as Record<string, unknown>).youtube),
            }
          : undefined,
    };
  }

  private parseApiSettings(
    value: Prisma.JsonValue,
  ): { embedUrl: string | null; apiToken: string | null; serviceAccountJson?: string | null } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { embedUrl: null, apiToken: null, serviceAccountJson: null };
    }
    const payload = value as Record<string, unknown>;
    return {
      embedUrl: typeof payload.embedUrl === 'string' ? payload.embedUrl : null,
      apiToken: typeof payload.apiToken === 'string' ? payload.apiToken : null,
      serviceAccountJson:
        typeof payload.serviceAccountJson === 'string'
          ? payload.serviceAccountJson
          : null,
    };
  }
}
