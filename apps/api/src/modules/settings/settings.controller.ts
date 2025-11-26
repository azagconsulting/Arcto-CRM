import { Body, Controller, Get, Put } from '@nestjs/common';

import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateImapSettingsDto } from './dto/update-imap-settings.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';
import { SettingsService } from './settings.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller({
  path: 'settings',
  version: '1',
})
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('smtp')
  getSmtpSettings() {
    return this.settingsService.getSmtpSettings();
  }

  @Put('smtp')
  updateSmtpSettings(@Body() dto: UpdateSmtpSettingsDto) {
    return this.settingsService.updateSmtpSettings(dto);
  }

  @Get('imap')
  getImapSettings() {
    return this.settingsService.getImapSettings();
  }

  @Put('imap')
  updateImapSettings(@Body() dto: UpdateImapSettingsDto) {
    return this.settingsService.updateImapSettings(dto);
  }

  @Get('workspace')
  getWorkspaceSettings() {
    return this.settingsService.getWorkspaceSettings();
  }

  @Put('workspace')
  updateWorkspaceSettings(@Body() dto: UpdateWorkspaceSettingsDto) {
    return this.settingsService.updateWorkspaceSettings(dto);
  }

  @Get('api')
  getApiSettings() {
    return this.settingsService.getApiSettings();
  }

  @Put('api')
  updateApiSettings(@Body() dto: UpdateApiSettingsDto) {
    return this.settingsService.updateApiSettings(dto);
  }

  @Public()
  @Get('ai-enabled')
  aiEnabled() {
    return { enabled: Boolean(process.env.OPENAI_API_KEY) };
  }
}
