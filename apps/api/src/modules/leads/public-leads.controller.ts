import { Body, Controller, Post } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller({
  path: 'public/leads',
  version: '1',
})
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.createFromLanding(dto);
  }
}
