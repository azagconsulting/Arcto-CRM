import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import { MarkMessagesReadDto } from './dto/mark-messages-read.dto';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';
import { CustomerMessagesService } from './customer-messages.service';

@Controller({
  path: 'messages',
  version: '1',
})
export class MessagesController {
  constructor(private readonly messagesService: CustomerMessagesService) {}

  @Get('by-email')
  getByEmail(@Query('email') email?: string) {
    if (!email?.trim()) {
      return [];
    }
    return this.messagesService.listByEmail(email);
  }

  @Get('sent')
  listSent(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listSent(query);
  }

  @Get('inbox')
  listInbox(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listInbox(query);
  }

  @Get('spam')
  listSpam(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listSpam(query);
  }

  @Get('unassigned')
  listUnassigned(@Query() query: ListCustomerMessagesDto) {
    return this.messagesService.listUnassignedMessages(query);
  }

  @Post('unassigned')
  sendUnassigned(@Body() dto: SendCustomerMessageDto) {
    return this.messagesService.sendUnassignedMessage(dto);
  }

  @Post('read')
  markRead(@Body() dto: MarkMessagesReadDto) {
    return this.messagesService.markMessagesRead(dto.ids);
  }

  @Get('unread-summary')
  unreadSummary() {
    return this.messagesService.getUnreadSummary();
  }
}
