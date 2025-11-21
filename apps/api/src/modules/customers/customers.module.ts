import { Module } from '@nestjs/common';

import { MailerModule } from '../../infra/mailer/mailer.module';
import { CustomerMessagesController } from './customer-messages.controller';
import { CustomerMessagesService } from './customer-messages.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [MailerModule],
  controllers: [CustomersController, CustomerMessagesController],
  providers: [CustomersService, CustomerMessagesService],
  exports: [CustomersService, CustomerMessagesService],
})
export class CustomersModule {}
