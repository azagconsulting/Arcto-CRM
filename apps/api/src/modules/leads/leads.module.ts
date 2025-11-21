import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PublicLeadsController } from './public-leads.controller';

@Module({
  imports: [UsersModule],
  controllers: [LeadsController, PublicLeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
